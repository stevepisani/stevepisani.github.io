// Temporary build-time mitigation for GHSA-mrhx-c7xc-m3w5. The dependency includes
// its own Zod, so overriding node_modules/zod does not patch the shipped parser.
// Reject oversized arrays BEFORE copying/parsing their elements. The app supplies
// a fixed background-removal configuration; its callback takes only three arguments.
// Remove this transform after adopting an upstream release with the fix built in.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const SHA256='1bac0a7afd5d6a32bca8032f5e14f292e9b800fee3f2e9931fe79ee70bd9a7fd';
export function hardenBackgroundRemoval(source){
  if(createHash('sha256').update(source).digest('hex')!==SHA256)throw new Error('Background-removal bundle changed: review the embedded Zod mitigation before building');
  const start=source.indexOf('var ZodArray = class _ZodArray extends ZodType {');
  const at=source.indexOf('    if (def.exactLength !== null) {',start);
  if(start<0||at<0)throw new Error('Embedded Zod array parser not found');
  const guard=`    // SJPJ bounded collection validation: fail before element allocation.
    const collectionLimit = Math.min(1024, def.maxLength?.value ?? Infinity, def.exactLength?.value ?? Infinity);
    if (ctx.data.length > collectionLimit) {
      addIssueToContext(ctx, { code: ZodIssueCode.too_big, maximum: collectionLimit, type: "array", inclusive: true, exact: false });
      return INVALID;
    }
`;
  return source.slice(0,at)+guard+source.slice(at);
}
export const backgroundRemovalHardening={name:'background-removal-bounded-zod',setup(build){
  build.onLoad({filter:/@imgly[\\/]background-removal[\\/]dist[\\/]index\.mjs$/},({path})=>({contents:hardenBackgroundRemoval(readFileSync(path,'utf8')),loader:'js'}));
}};
