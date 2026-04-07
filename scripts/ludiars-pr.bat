@echo off
setlocal enabledelayedexpansion
REM LUDIARS 全リポジトリ PR ステータス確認スクリプト (Windows)
REM Usage: ludiars-pr.bat [base_dir]

set "BASE_DIR=%~1"
if "%BASE_DIR%"=="" set "BASE_DIR=<workspace-root>"

set TOTAL_PRS=0
set TOTAL_NEEDS_ACTION=0
set REPO_COUNT=0

echo ## LUDIARS PR ステータス
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
echo ### サマリ
echo - 対象リポジトリ: %REPO_COUNT%件
echo - オープンPR合計: %TOTAL_PRS%件
echo - 要対応 (CHANGES_REQUESTED): %TOTAL_NEEDS_ACTION%件

endlocal
exit /b 0

:process_repo
set "REPO_DIR=%~1"
for %%N in ("%REPO_DIR%") do set "REPO_NAME=%%~nxN"

REM Get PR count
for /f %%C in ('gh pr list --repo "LUDIARS/%REPO_NAME%" --state open --json number --jq "length" 2^>nul') do set "PR_COUNT=%%C"

if not defined PR_COUNT set "PR_COUNT=0"
if "%PR_COUNT%"=="" set "PR_COUNT=0"

if "%PR_COUNT%"=="0" (
    echo ### %REPO_NAME% (0件)
    echo （オープンPRなし）
    echo.
    exit /b
)

echo ### %REPO_NAME% (%PR_COUNT%件)
echo.
echo ^| PR ^| タイトル ^| ブランチ ^| 作成者 ^| レビュー ^|
echo ^|----^|---------^|---------^|--------^|---------^|

REM List PRs
gh pr list --repo "LUDIARS/%REPO_NAME%" --state open --json number,title,headRefName,author,reviewDecision --jq ".[] | \"| #\(.number) | \(.title[:50]) | \(.headRefName) | \(.author.login) | \(.reviewDecision // \"PENDING\") |\"" 2>nul

REM Count needs-action
for /f %%A in ('gh pr list --repo "LUDIARS/%REPO_NAME%" --state open --json reviewDecision --jq "[.[] | select(.reviewDecision==\"CHANGES_REQUESTED\")] | length" 2^>nul') do set "NEEDS_ACTION=%%A"
if not defined NEEDS_ACTION set "NEEDS_ACTION=0"

set /a TOTAL_PRS+=%PR_COUNT%
set /a TOTAL_NEEDS_ACTION+=%NEEDS_ACTION%

echo.
exit /b
