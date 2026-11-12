import ts from 'typescript';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sources=(await readdir(resolve('apps/api/src'))).filter(name=>name.endsWith('.ts'));
const publicPaths=new Set(['/health','/ready','/robots.txt','/sitemap.xml','/*','/api/v1/auth/login','/api/v1/invitations/inspect','/api/v1/invitations/accept']);
const methods=new Set(['get','post','patch','put','delete']);
const routes:Array<{method:string;path:string|null;file:string;line:number;access:string}>=[];
for(const name of sources){
  const path=resolve('apps/api/src',name),content=await readFile(path,'utf8');
  const file=ts.createSourceFile(path,content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const constants=new Map<string,string>();
  const collect=(node:ts.Node)=>{
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer&&ts.isStringLiteral(node.initializer))constants.set(node.name.text,node.initializer.text);
    ts.forEachChild(node,collect);
  };
  collect(file);
  const routePaths=(node:ts.Node):string[]|null=>{
    if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return [node.text];
    if(ts.isIdentifier(node)){
      if(constants.has(node.text))return [constants.get(node.text)!];
      let parent:ts.Node|undefined=node.parent;
      while(parent){
        if(ts.isForOfStatement(parent)&&ts.isVariableDeclarationList(parent.initializer)&&parent.initializer.declarations.some(declaration=>ts.isIdentifier(declaration.name)&&declaration.name.text===node.text)){
          const expression=ts.isAsExpression(parent.expression)?parent.expression.expression:parent.expression;
          if(ts.isArrayLiteralExpression(expression)&&expression.elements.every(ts.isStringLiteral))return expression.elements.map(element=>(element as ts.StringLiteral).text);
        }
        parent=parent.parent;
      }
      return null;
    }
    if(ts.isTemplateExpression(node)){
      let values=[node.head.text];
      for(const span of node.templateSpans){const parts=routePaths(span.expression);if(parts===null)return null;values=values.flatMap(value=>parts.map(part=>value+part+span.literal.text));}
      return values;
    }
    return null;
  };
  const visit=(node:ts.Node)=>{
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(file)==='app'&&methods.has(node.expression.name.text)){
      const pathNode=node.arguments[0],handler=node.arguments.at(-1);
      if(pathNode&&handler){
        const body=handler.getText(file);
        const guardPattern=name==='discipline.ts'?/\b(?:organizationAccess|teamAccess|organizer)\s*\(/:name==='tournament-payments.ts'?/\bscope\s*\(/:/\b(?:organizationAccess|organizationBrandAccess|teamAccess|teamScope|captureAccess|requireAuth|requireOwner|access)\s*\(/;
        for(const route of routePaths(pathNode)||[null]){
          const access=route&&(route.startsWith('/api/v1/public/')||publicPaths.has(route))?'public-or-token':guardPattern.test(body)?'guarded':'REVIEW';
          routes.push({method:node.expression.name.text.toUpperCase(),path:route,file:name,line:file.getLineAndCharacterOfPosition(node.getStart(file)).line+1,access});
        }
      }
    }
    ts.forEachChild(node,visit);
  };
  visit(file);
}
const unresolved=routes.filter(route=>route.access==='REVIEW'||route.path===null);
export const routeInventory=routes;
const report={at:new Date().toISOString(),routes:routes.length,publicOrToken:routes.filter(route=>route.access==='public-or-token').length,guarded:routes.filter(route=>route.access==='guarded').length,unresolved};
await writeFile('.local/security-routes.json',JSON.stringify({...report,inventory:routes},null,2));
console.log(JSON.stringify(report));
if(unresolved.length)process.exitCode=2;
