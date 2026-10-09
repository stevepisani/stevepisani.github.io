// A door's opening, drawn as a window onto somewhere else: a panorama (equirectangular, its
// centre straight through the opening) looked up by the way you're looking through it, as if
// painted on a sphere `far` metres round the spot it was taken from (`centre`, in the opening's
// frame), so from further back you see more of it, as through a real opening. Shader source only
// (no three.js here): the planet's door (props.js) and the door back in the place (portal.js) each
// build their ShaderMaterial from it with their own three.js.
export const windowVertex = `
  varying vec3 vEye, vDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    mat3 toLocal = inverse(mat3(modelMatrix));
    vEye = toLocal * (cameraPosition - modelMatrix[3].xyz); // your eye in the opening's frame
    vDir = toLocal * (world.xyz - cameraPosition); // linear across the plane, so per vertex is exact
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

export const windowFragment = `
  uniform sampler2D view;
  uniform float ready, brightness, far;
  uniform vec3 sky, centre;
  varying vec3 vEye, vDir;
  void main() {
    vec3 o = vEye - centre, r = normalize(vDir);
    float b = dot(o, r), k = dot(o, o) - far * far;
    vec3 d = normalize(o + (-b + sqrt(max(b * b - k, 0.0))) * r);
    float yaw = atan(-d.x, -d.z), pitch = asin(clamp(d.y, -1.0, 1.0));
    vec2 uv = vec2(0.5 - yaw / 6.2831853, 0.5 + pitch / 3.1415927);
    vec3 c = mix(sky, texture2D(view, uv).rgb, ready);
    gl_FragColor = vec4(c * brightness, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
