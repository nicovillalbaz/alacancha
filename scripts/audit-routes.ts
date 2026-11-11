import ts from 'typescript';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sources=['app.ts','discipline.ts','flyers.ts','fixture-progress-routes.ts','fixture-referees-routes.ts','private-exports.ts','public-web.ts'];
const publicPaths=new Set(['/health','/ready','/robots.txt','/sitemap.xml','/*','/api/v1/auth/login','/api/v1/invitations/inspect','/api/v1/invitations/accept']);
const methods=new Set(['get','post','patch','put','delete']);
const routes:Array<{method:string;path:string;file:string;line:number;access:string}>=[];
for(const name of sources){
  const path=resolve('apps/api/src',name),content=await readFile(path,'utf8');
  const file=ts.createSourceFile(path,content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const visit=(node:ts.Node)=>{
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(file)==='app'&&methods.has(node.expression.name.text)){
      const pathNode=node.arguments[0],handler=node.arguments.at(-1);
      if(pathNode&&ts.isStringLiteral(pathNode)&&handler){
        const route=pathNode.text,body=handler.getText(file);
        const access=route.startsWith('/api/v1/public/')||publicPaths.has(route)?'public-or-token':/\b(?:organizationAccess|teamAccess|teamScope|captureAccess|requireAuth|requireOwner|access)\s*\(/.test(body)?'guarded':'REVIEW';
        routes.push({method:node.expression.name.text.toUpperCase(),path:route,file:name,line:file.getLineAndCharacterOfPosition(node.getStart(file)).line+1,access});
      }
    }
    ts.forEachChild(node,visit);
  };
  visit(file);
}
const unresolved=routes.filter(route=>route.access==='REVIEW');
const report={at:new Date().toISOString(),routes:routes.length,publicOrToken:routes.filter(route=>route.access==='public-or-token').length,guarded:routes.filter(route=>route.access==='guarded').length,unresolved};
await writeFile('.local/security-routes.json',JSON.stringify({...report,inventory:routes},null,2));
console.log(JSON.stringify(report));
if(unresolved.length)process.exitCode=2;
