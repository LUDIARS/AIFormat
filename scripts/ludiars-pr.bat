@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion
REM LUDIARS All-Repo PR Status Check (Windows)
REM Usage: ludiars-pr.bat [base_dir]

set "BASE_DIR=%~1"
if "%BASE_DIR%"=="" set "BASE_DIR=<workspace-root>"

set TOTAL_PRS=0
set TOTAL_NEEDS_ACTION=0
set REPO_COUNT=0

echo ## LUDIARS PR Status
echo.

REM Collect LUDIARS repos
for /d %%D in ("%BASE_DIR%\*") do (
    if exist "%%D\.git" (
        for /f "delims=" %%R in ('git -C "%%D" remote get-url origin 2^>nul') do (
            echo %%R | findstr /i "LUDIARS" >nul 2>nul
            if !errorlevel! equ 0 (
                set /a REPO_COUNT+=1
                call :process_repo "%%D"
            )
        )
    )
)

echo ---
echo.
echo ### Summary
echo - Repos: %REPO_COUNT%
echo - Open PRs: %TOTAL_PRS%
echo - Needs action (CHANGES_REQUESTED): %TOTAL_NEEDS_ACTION%

endlocal
exit /b 0

:process_repo
set "REPO_DIR=%~1"
for %%N in ("%REPO_DIR%") do set "REPO_NAME=%%~nxN"

set "PR_COUNT="
for /f %%C in ('gh pr list --repo "LUDIARS/%REPO_NAME%" --state open --json number --jq "length" 2^>nul') do set "PR_COUNT=%%C"

if not defined PR_COUNT set "PR_COUNT=0"
if "%PR_COUNT%"=="" set "PR_COUNT=0"

if "%PR_COUNT%"=="0" (
    echo ### %REPO_NAME% ^(0^)
    echo No open PRs
    echo.
    exit /b
)

echo ### %REPO_NAME% ^(%PR_COUNT%^)
echo.
echo ^| PR ^| Title ^| Branch ^| Author ^| Review ^|
echo ^|----^|-------^|--------^|--------^|--------^|

gh pr list --repo "LUDIARS/%REPO_NAME%" --state open --json number,title,headRefName,author,reviewDecision --jq ".[] | \"| #\(.number) | \(.title[:50]) | \(.headRefName) | \(.author.login) | \(.reviewDecision // \"PENDING\") |\"" 2>nul

set "NEEDS_ACTION="
for /f %%A in ('gh pr list --repo "LUDIARS/%REPO_NAME%" --state open --json reviewDecision --jq "[.[] | select(.reviewDecision==\"CHANGES_REQUESTED\")] | length" 2^>nul') do set "NEEDS_ACTION=%%A"
if not defined NEEDS_ACTION set "NEEDS_ACTION=0"

set /a TOTAL_PRS+=%PR_COUNT%
set /a TOTAL_NEEDS_ACTION+=%NEEDS_ACTION%

echo.
exit /b
