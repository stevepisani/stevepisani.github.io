// Keep the complete authored sentence inside the bounded texture. Large measured strings
// reduce font size; clamping the bitmap alone would silently cut off their first/last words.
export function textLayout(measuredWidth,{fontSize=96,maxWidth=2048,padding=64,height=144}={}) {
  const width=Math.max(padding+1,Math.min(maxWidth,Math.ceil(measuredWidth)+padding));
  const font=Math.min(fontSize,fontSize*(width-padding)/Math.max(1,measuredWidth));
  return {width,height,font,glyphFraction:font/height};
}
