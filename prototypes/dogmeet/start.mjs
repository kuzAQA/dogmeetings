import { createServer, build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { cp } from 'node:fs/promises';
const root = fileURLToPath(new URL('.', import.meta.url));
const config = {configFile:false, root, publicDir:fileURLToPath(new URL('../../public', import.meta.url)), plugins:[react()], server:{host:'127.0.0.1',port:4178,strictPort:true}, build:{outDir:'dist',rollupOptions:{input:{main:`${root}index.html`,gallery:`${root}gallery.html`}}}};
if(process.argv.includes('--build')) {await build(config);for(const name of ['png','COVERAGE.md','RESEARCH.md','QA.md'])await cp(`${root}${name}`,`${root}dist/${name}`,{recursive:true}).catch(error=>{if(error.code!=='ENOENT')throw error});}
else { const server=await createServer(config); await server.listen(); server.printUrls(); }
