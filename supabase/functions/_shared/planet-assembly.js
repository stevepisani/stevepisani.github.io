// Narrow, deterministic assembly tolerances. Validation still owns every other constraint.
import {LIMITS, MIN_PART_SIZE} from './planet.js';
export function assemblePlanet(input) {
  const adjustments=[];
  if(!input || typeof input!=='object' || Array.isArray(input))return {spec:input,adjustments};
  // Do not let compacted labels disguise an oversized request.
  try { if(new TextEncoder().encode(JSON.stringify(input)).length>LIMITS.bytes)return {spec:input,adjustments}; } catch {return {spec:input,adjustments};}
  const spec=structuredClone(input);
  const label=(object,key,path)=>{
    const value=object?.[key];
    if(typeof value==='string' && value.length>LIMITS.name){
      const short=value.slice(0,LIMITS.name-1).replace(/[\uD800-\uDBFF]$/,'').trimEnd()+'…';
      object[key]=short;adjustments.push({path,kind:'display-label',original:value,value:short});
    }
  };
  label(spec.who,'name','who.name');
  if(Array.isArray(spec.links))spec.links.forEach((x,i)=>label(x,'label',`links[${i}].label`));
  if(spec.collections && typeof spec.collections==='object')for(const [id,c]of Object.entries(spec.collections))label(c,'title',`collections.${id}.title`);
  if(Array.isArray(spec.things))spec.things.forEach((t,i)=>{
    label(t,'name',`things[${i}].name`);
    label(t?.response,'label',`things[${i}].response.label`);label(t?.response,'done',`things[${i}].response.done`);
    if(!Array.isArray(t?.parts))return;
    t.parts.forEach((p,j)=>{
      for(const [object,path]of [[p,`things[${i}].parts[${j}]`],[p?.after,`things[${i}].parts[${j}].after`]]){
        if(!Array.isArray(object?.size)||object.size.length!==3)continue;
        object.size=object.size.map((v,k)=>{
          if(Number.isFinite(v)&&v>0&&v<MIN_PART_SIZE){adjustments.push({path:`${path}.size[${k}]`,kind:'minimum-thickness',original:v,value:MIN_PART_SIZE});return MIN_PART_SIZE;}
          return v;
        });
      }
    });
  });
  return {spec,adjustments};
}
