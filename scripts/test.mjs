import {spawnSync} from 'node:child_process';
const commands=[['--test','tests/react-browser.test.mjs'],...['game-monitor','game-watch-ui','highlights','notification-link','recap-policy','youtube-link'].map(name=>[`tests/${name}.cjs`])];
for(const args of commands){const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1)}
