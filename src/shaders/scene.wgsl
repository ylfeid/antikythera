// Lit metal for the mechanism: Blinn–Phong with a metallic tint, hemisphere
// ambient, Fresnel rim, optional texture (dial faces), a clipping plane for
// the slice view and an X-ray mode that fades faces seen head-on.

struct Camera {
  viewProj: mat4x4f,
  eye: vec4f,
  lightDir: vec4f,
  clipPlane: vec4f, // xyz normal, w offset; fragments with dot(n, p) > w are cut
  params: vec4f,    // x: clip enabled, y: x-ray, z: time
};

struct Object {
  model: mat4x4f,
  color: vec4f,     // rgb base colour, a opacity
  material: vec4f,  // x metallic, y roughness, z textured, w emissive
  highlight: vec4f, // rgb added glow, a selection pulse
};

@group(0) @binding(0) var<uniform> cam: Camera;
@group(1) @binding(0) var<uniform> obj: Object;
@group(2) @binding(0) var tex: texture_2d<f32>;
@group(2) @binding(1) var samp: sampler;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};

@vertex
fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> VSOut {
  var o: VSOut;
  let w = obj.model * vec4f(p, 1.0);
  o.world = w.xyz;
  o.pos = cam.viewProj * w;
  o.normal = normalize((obj.model * vec4f(n, 0.0)).xyz);
  o.uv = uv;
  return o;
}

@fragment
fn fs(i: VSOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  if (cam.params.x > 0.5 && dot(cam.clipPlane.xyz, i.world) > cam.clipPlane.w) {
    discard;
  }
  var n = normalize(i.normal);
  if (!front) { n = -n; }
  let v = normalize(cam.eye.xyz - i.world);
  let l = normalize(cam.lightDir.xyz);
  let h = normalize(l + v);

  var base = obj.color.rgb;
  var alpha = obj.color.a;
  if (obj.material.z > 0.5) {
    let t = textureSample(tex, samp, i.uv);
    base = mix(base, t.rgb, t.a);
  }
  let metallic = obj.material.x;
  let rough = obj.material.y;
  let shin = mix(140.0, 12.0, rough);

  let ndl = max(dot(n, l), 0.0);
  let fill = max(dot(n, normalize(vec3f(-0.4, -0.2, 0.8))), 0.0) * 0.25;
  let hemi = mix(vec3f(0.16, 0.15, 0.14), vec3f(0.42, 0.42, 0.44), n.y * 0.5 + 0.5);
  let spec = pow(max(dot(n, h), 0.0), shin) * mix(0.25, 1.1, metallic) * (1.0 - rough * 0.6);
  let specColor = mix(vec3f(1.0), base, metallic);
  let fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);

  var c = base * (hemi + ndl * 0.85 + fill) + specColor * spec + fres * 0.18 * mix(vec3f(1.0), base, 0.5);
  c += base * obj.material.w;
  c += obj.highlight.rgb * (0.55 + 0.45 * obj.highlight.a);

  if (cam.params.y > 0.5) {
    // X-ray: edges and grazing faces stay visible, head-on faces fade.
    alpha = alpha * (0.18 + 0.82 * pow(1.0 - abs(dot(n, v)), 2.0));
  }
  // Simple filmic curve.
  c = c / (c + vec3f(0.65)) * 1.55;
  return vec4f(c, alpha);
}
