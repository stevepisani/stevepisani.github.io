// Keep the complete authored sentence inside the bounded texture. Large measured strings
// reduce font size; clamping the bitmap alone would silently cut off their first/last words.
export function textLayout(measuredWidth,{fontSize=96,maxWidth=2048,padding=64,height=144,measure}={}) {
  const width=Math.max(padding+1,Math.min(maxWidth,Math.ceil(measuredWidth)+padding));
  let font=Math.min(fontSize,fontSize*(width-padding)/Math.max(1,measuredWidth));
  // Optical-size fonts need not scale linearly. Fit the actual chosen font after sizing,
  // rather than trusting a ratio from its original 96px measurement.
  if(measure&&measuredWidth>width-padding) {
    let low=0,high=fontSize;
    for(let i=0;i<16;i++) {const mid=(low+high)/2;if(measure(mid)<=width-padding)low=mid;else high=mid;}
    font=Math.floor(low*1000)/1000;
  }
  return {width,height,font,glyphFraction:font/height};
}
