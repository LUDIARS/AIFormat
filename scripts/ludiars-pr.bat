@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion
REM LUDIARS All-Repo PR Status Check (Windows)
REM Usage: ludiars-pr.bat [base_dir]
REM Requires: gh, node

set "BASE_DIR=%~1"
if "%BASE_DIR%"=="" set "BASE_DIR=<workspace-root>"

REM Delegate to Node.js for reliable output
node -e "const{execSync:x}=require('child_process'),fs=require('fs'),path=require('path');const base=process.argv[1];const dirs=fs.readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>path.join(base,d.name)).filter(d=>{try{const r=x('git -C \"'+d+'\" remote get-url origin',{encoding:'utf8',stdio:['pipe','pipe','pipe']});return/LUDIARS/i.test(r)}catch{return false}});let total=0,action=0;console.log('## LUDIARS PR Status\n');const results=[];for(const d of dirs){const name=path.basename(d);try{const j=x('gh pr list --repo LUDIARS/'+name+' --state open --json number,title,headRefName,author,reviewDecision',{encoding:'utf8',stdio:['pipe','pipe','pipe']});const prs=JSON.parse(j);results.push({name,prs})}catch{results.push({name,prs:[]})}}results.sort((a,b)=>b.prs.length-a.prs.length);for(const{name,prs}of results){if(!prs.length){console.log('### '+name+' (0)\nNo open PRs\n');continue}console.log('### '+name+' ('+prs.length+')\n');console.log('| PR | Title | Branch | Author | Review |');console.log('|----|-------|--------|--------|--------|');for(const p of prs){const rv=p.reviewDecision||'PENDING';const mk=rv==='CHANGES_REQUESTED'?' !!':'';console.log('| #'+p.number+' | '+p.title.slice(0,50)+' | '+p.headRefName+' | '+(p.author&&p.author.login||'?')+' | '+rv+mk+' |');if(rv==='CHANGES_REQUESTED')action++}total+=prs.length;console.log('')}console.log('---\n### Summary');console.log('- Repos: '+dirs.length);console.log('- Open PRs: '+total);console.log('- Needs action: '+action)" "%BASE_DIR%"

endlocal
