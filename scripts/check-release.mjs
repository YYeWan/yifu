import {execFileSync} from 'node:child_process';
import {lstat} from 'node:fs/promises';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean),issues=[];
if(!files.length)throw Error('Stage the release files before checking.');
for(const file of files){
 if(/(^|\/)(?:\.local|node_modules|qa|graphify-out|\.vercel)(\/|$)/.test(file)||/(^|\/)\.env(?:\..*)?$/.test(file)&&file!=='.env.example'||/\.(?:pem|key|mp4|mov|jpg|jpeg|png|webp)$/i.test(file)){issues.push(`${file}: private/generated file`);continue;}
 const info=await lstat(file);if(info.isSymbolicLink()){issues.push(`${file}: symlink`);continue;}
 const s=execFileSync('git',['show',':'+file],{encoding:'utf8'});
 const checks=[['local home path',/\/Users\/[A-Za-z0-9._-]+\//],['private tunnel',/https?:\/\/[a-z0-9-]+\.trycloudflare\.com/i],['provider key',/\bsk-[A-Za-z0-9_-]{20,}\b/],['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/],['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['embedded JWT',/\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/]];
 for(const [name,pattern] of checks)if(pattern.test(s))issues.push(`${file}: ${name}`);
 if(file==='.env.example')for(const line of s.split('\n'))if(/^[A-Z_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)=.+/.test(line))issues.push(`${file}: nonempty credential`);
}
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}else console.log(`Release checks passed (${files.length} tracked files, no private files or detected credentials).`);
