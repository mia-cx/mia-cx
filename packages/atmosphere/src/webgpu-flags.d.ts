/**
 * TypeScript 6's DOM lib types the WebGPU API but leaves out the flag namespaces, which the spec
 * defines as globals. Values are from the WebGPU specification. @webgpu/types would supply them,
 * but its interface declarations now clash with the DOM lib's.
 */
declare const GPUBufferUsage: {
    readonly MAP_READ: 0x0001;
    readonly MAP_WRITE: 0x0002;
    readonly COPY_SRC: 0x0004;
    readonly COPY_DST: 0x0008;
    readonly INDEX: 0x0010;
    readonly VERTEX: 0x0020;
    readonly UNIFORM: 0x0040;
    readonly STORAGE: 0x0080;
    readonly INDIRECT: 0x0100;
    readonly QUERY_RESOLVE: 0x0200;
};
declare const GPUTextureUsage: {
    readonly COPY_SRC: 0x01;
    readonly COPY_DST: 0x02;
    readonly TEXTURE_BINDING: 0x04;
    readonly STORAGE_BINDING: 0x08;
    readonly RENDER_ATTACHMENT: 0x10;
};
declare const GPUMapMode: {
    readonly READ: 0x0001;
    readonly WRITE: 0x0002;
};
declare const GPUShaderStage: {
    readonly VERTEX: 0x1;
    readonly FRAGMENT: 0x2;
    readonly COMPUTE: 0x4;
};
declare const GPUColorWrite: {
    readonly RED: 0x1;
    readonly GREEN: 0x2;
    readonly BLUE: 0x4;
    readonly ALPHA: 0x8;
    readonly ALL: 0xf;
};

/** The DOM lib also has no `getContext("webgpu")` overload yet. */
interface HTMLCanvasElement {
    getContext(contextId: 'webgpu', options?: unknown): GPUCanvasContext | null;
}
