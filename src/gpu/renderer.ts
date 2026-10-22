// WebGPU renderer: one lit shader, an opaque and a blended pipeline, 4× MSAA,
// per-object uniforms in a dynamic-offset buffer, and mipmapped canvas
// textures for the dial faces.

import shaderCode from '../shaders/scene.wgsl?raw';
import type { MeshData } from './meshes.ts';
import type { Mat4, Vec3 } from './math.ts';

export interface GPUMesh {
  vertex: GPUBuffer;
  index: GPUBuffer;
  count: number;
}

export interface RenderObject {
  mesh: GPUMesh;
  model: Mat4;
  color: [number, number, number, number];
  material: [number, number, number, number]; // metallic, roughness, textured, emissive
  highlight: [number, number, number, number];
  texture?: GPUBindGroup;
  visible: boolean;
  depth?: number; // view depth for sorting, filled by the renderer
}

export interface CameraState {
  viewProj: Mat4;
  eye: Vec3;
  lightDir: Vec3;
  clip: { enabled: boolean; normal: Vec3; offset: number };
  xray: boolean;
}

const OBJECT_STRIDE = 256;
const SAMPLES = 4;

export class Renderer {
  readonly device: GPUDevice;
  readonly canvas: HTMLCanvasElement;
  private readonly context: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly opaque: GPURenderPipeline;
  private readonly blended: GPURenderPipeline;
  private readonly cameraBuffer: GPUBuffer;
  private readonly cameraGroup: GPUBindGroup;
  private objectBuffer: GPUBuffer;
  private objectGroup: GPUBindGroup;
  private capacity = 0;
  private readonly objectLayout: GPUBindGroupLayout;
  private readonly textureLayout: GPUBindGroupLayout;
  private readonly sampler: GPUSampler;
  readonly blankTexture: GPUBindGroup;
  private msaa?: GPUTexture;
  private depth?: GPUTexture;
  private mipPipeline?: GPURenderPipeline;
  private readonly staging = new Float32Array(OBJECT_STRIDE / 4);
  clearColor: GPUColor = { r: 0.0745, g: 0.0745, b: 0.0745, a: 1 }; // the page background, #131313

  constructor(device: GPUDevice, canvas: HTMLCanvasElement) {
    this.device = device;
    this.canvas = canvas;
    this.context = canvas.getContext('webgpu')!;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format: this.format, alphaMode: 'opaque' });

    const module = device.createShaderModule({ code: shaderCode });
    const cameraLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    this.objectLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true } }],
    });
    this.textureLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [cameraLayout, this.objectLayout, this.textureLayout] });
    const vertex: GPUVertexState = {
      module,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 32,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x2' },
          ],
        },
      ],
    };
    const make = (blend: boolean) =>
      device.createRenderPipeline({
        layout,
        vertex,
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [
            {
              format: this.format,
              blend: blend
                ? {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                  }
                : undefined,
            },
          ],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: !blend, depthCompare: 'less' },
        multisample: { count: SAMPLES },
      });
    this.opaque = make(false);
    this.blended = make(true);

    this.cameraBuffer = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.cameraGroup = device.createBindGroup({ layout: cameraLayout, entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }] });
    this.objectBuffer = this.allocObjects(256);
    this.objectGroup = this.makeObjectGroup();
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 8, addressModeU: 'repeat', addressModeV: 'clamp-to-edge' });
    const white = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: white }, new Uint8Array([255, 255, 255, 0]), {}, [1, 1]);
    this.blankTexture = device.createBindGroup({
      layout: this.textureLayout,
      entries: [
        { binding: 0, resource: white.createView() },
        { binding: 1, resource: this.sampler },
      ],
    });
  }

  private allocObjects(n: number) {
    this.capacity = n;
    return this.device.createBuffer({ size: n * OBJECT_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  private makeObjectGroup() {
    return this.device.createBindGroup({
      layout: this.objectLayout,
      entries: [{ binding: 0, resource: { buffer: this.objectBuffer, size: 112 } }],
    });
  }

  createMesh(m: MeshData): GPUMesh {
    const n = m.positions.length / 3;
    const data = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      data.set(m.positions.slice(i * 3, i * 3 + 3), i * 8);
      data.set(m.normals.slice(i * 3, i * 3 + 3), i * 8 + 3);
      data.set(m.uvs.slice(i * 2, i * 2 + 2), i * 8 + 6);
    }
    const vertex = this.device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(vertex, 0, data);
    const idx = new Uint32Array(m.indices);
    const index = this.device.createBuffer({ size: Math.max(4, idx.byteLength), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(index, 0, idx);
    return { vertex, index, count: idx.length };
  }

  // A canvas becomes a mipmapped texture bind group.
  createTexture(source: HTMLCanvasElement | OffscreenCanvas): GPUBindGroup {
    const { device } = this;
    const levels = Math.floor(Math.log2(Math.max(source.width, source.height))) + 1;
    const texture = device.createTexture({
      size: [source.width, source.height],
      format: 'rgba8unorm',
      mipLevelCount: levels,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source }, { texture, premultipliedAlpha: false }, [source.width, source.height]);
    this.generateMips(texture, levels);
    return device.createBindGroup({
      layout: this.textureLayout,
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: this.sampler },
      ],
    });
  }

  private generateMips(texture: GPUTexture, levels: number) {
    const { device } = this;
    if (!this.mipPipeline) {
      const module = device.createShaderModule({
        code: `
          @group(0) @binding(0) var src: texture_2d<f32>;
          @group(0) @binding(1) var smp: sampler;
          struct O { @builtin(position) p: vec4f, @location(0) uv: vec2f };
          @vertex fn vs(@builtin(vertex_index) i: u32) -> O {
            var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
            var o: O; o.p = vec4f(q[i], 0, 1); o.uv = q[i] * vec2f(0.5, -0.5) + 0.5; return o;
          }
          @fragment fn fs(o: O) -> @location(0) vec4f { return textureSample(src, smp, o.uv); }`,
      });
      this.mipPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
      });
    }
    const smp = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    const enc = device.createCommandEncoder();
    for (let l = 1; l < levels; l++) {
      const bg = device.createBindGroup({
        layout: this.mipPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: texture.createView({ baseMipLevel: l - 1, mipLevelCount: 1 }) },
          { binding: 1, resource: smp },
        ],
      });
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: texture.createView({ baseMipLevel: l, mipLevelCount: 1 }), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
      });
      pass.setPipeline(this.mipPipeline);
      pass.setBindGroup(0, bg);
      pass.draw(3);
      pass.end();
    }
    device.queue.submit([enc.finish()]);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h || !this.msaa) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.msaa?.destroy();
      this.depth?.destroy();
      this.msaa = this.device.createTexture({ size: [w, h], format: this.format, sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT });
      this.depth = this.device.createTexture({ size: [w, h], format: 'depth24plus', sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    }
    return w / h;
  }

  render(objects: RenderObject[], cam: CameraState) {
    const { device } = this;
    this.resize();
    const camData = new Float32Array(32);
    camData.set(cam.viewProj, 0);
    camData.set([...cam.eye, 1], 16);
    camData.set([...cam.lightDir, 0], 20);
    camData.set([...cam.clip.normal, cam.clip.offset], 24);
    camData.set([cam.clip.enabled ? 1 : 0, cam.xray ? 1 : 0, performance.now() / 1000, 0], 28);
    device.queue.writeBuffer(this.cameraBuffer, 0, camData);

    const visible = objects.filter((o) => o.visible && o.color[3] > 0.003);
    if (visible.length > this.capacity) {
      this.objectBuffer.destroy();
      this.objectBuffer = this.allocObjects(Math.ceil(visible.length * 1.5));
      this.objectGroup = this.makeObjectGroup();
    }
    // View depth for sorting blended objects back to front.
    const vp = cam.viewProj;
    for (const o of visible) {
      const m = o.model;
      o.depth = vp[2] * m[12] + vp[6] * m[13] + vp[10] * m[14] + vp[14];
    }
    const isBlended = (o: RenderObject) => cam.xray || o.color[3] < 0.999;
    const opaque = visible.filter((o) => !isBlended(o));
    const blended = visible.filter(isBlended).sort((a, b) => b.depth! - a.depth!);
    const ordered = [...opaque, ...blended];
    const data = new Float32Array((ordered.length * OBJECT_STRIDE) / 4);
    ordered.forEach((o, i) => {
      const s = this.staging;
      s.set(o.model, 0);
      s.set(o.color, 16);
      s.set(o.material, 20);
      s.set(o.highlight, 24);
      data.set(s.subarray(0, 28), (i * OBJECT_STRIDE) / 4);
    });
    device.queue.writeBuffer(this.objectBuffer, 0, data);

    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: this.msaa!.createView(),
          resolveTarget: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'discard',
          clearValue: this.clearColor,
        },
      ],
      depthStencilAttachment: { view: this.depth!.createView(), depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 1 },
    });
    pass.setBindGroup(0, this.cameraGroup);
    let current: GPURenderPipeline | null = null;
    ordered.forEach((o, i) => {
      const pipe = isBlended(o) ? this.blended : this.opaque;
      if (pipe !== current) {
        pass.setPipeline(pipe);
        current = pipe;
      }
      pass.setBindGroup(1, this.objectGroup, [i * OBJECT_STRIDE]);
      pass.setBindGroup(2, o.texture ?? this.blankTexture);
      pass.setVertexBuffer(0, o.mesh.vertex);
      pass.setIndexBuffer(o.mesh.index, 'uint32');
      pass.drawIndexed(o.mesh.count);
    });
    pass.end();
    device.queue.submit([enc.finish()]);
  }
}
