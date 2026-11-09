// Bidirectional optical flow. The approved sprite PNG is never modified.
export async function createMotionRenderer(image) {
  const surface=document.createElement('canvas');surface.width=surface.height=640;
  const gl=surface.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false});
  if(!gl)throw new Error('WebGL2 unavailable');
  const [mr,fr]=await Promise.all([fetch(new URL('./flow.json',import.meta.url)),fetch(new URL('./flow.bin',import.meta.url))]);
  if(!mr.ok||!fr.ok)throw new Error('Motion data unavailable');
  const meta=await mr.json(),bytes=await fr.arrayBuffer();
  if(bytes.byteLength!==meta.bytes)throw new Error('Incomplete motion data');
  const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
  const vertex=compile(gl.VERTEX_SHADER,`#version 300 es
    in vec2 position;out vec2 uv;
    void main(){gl_Position=vec4(position,0.,1.);uv=vec2((position.x+1.)*.5,(1.-position.y)*.5);}`);
  const fragment=compile(gl.FRAGMENT_SHADER,`#version 300 es
    precision highp float;
    uniform sampler2D atlas;uniform sampler2D flow;
    uniform float row;uniform float column;uniform float fraction;
    in vec2 uv;out vec4 color;
    vec4 artwork(vec2 p,float col){
      if(any(lessThan(p,vec2(0.)))||any(greaterThan(p,vec2(1.))))return vec4(0.);
      return texture(atlas,(clamp(p,vec2(.0016),vec2(.9984))+vec2(col,row))/4.);
    }
    void main(){
      vec2 forward=texture(flow,uv).xy;vec2 backward=texture(flow,uv).zw;
      vec2 a=uv-fraction*texture(flow,clamp(uv-fraction*forward,0.,1.)).xy;
      vec2 b=uv-(1.-fraction)*texture(flow,clamp(uv-(1.-fraction)*backward,0.,1.)).zw;
      // Keep the waving paw opaque: its silhouette occludes different pixels.
      color=row>2.5?artwork(a,column):mix(artwork(a,column),artwork(b,mod(column+1.,4.)),fraction);
    }`);
  const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  function texture(unit,filter){const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
  texture(0,gl.LINEAR);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.uniform1i(gl.getUniformLocation(program,'atlas'),0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  const fields=new Float32Array(bytes),pairSize=meta.grid*meta.grid*4,filter=gl.getExtension('OES_texture_float_linear')?gl.LINEAR:gl.NEAREST,textures=[];
  for(let i=0;i<16;i++){textures.push(texture(1,filter));gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,meta.grid,meta.grid,0,gl.RGBA,gl.FLOAT,fields.subarray(i*pairSize,(i+1)*pairSize));}
  gl.uniform1i(gl.getUniformLocation(program,'flow'),1);
  const locations=['row','column','fraction'].map(n=>gl.getUniformLocation(program,n));
  let lost=false;surface.addEventListener('webglcontextlost',()=>{lost=true;});
  return {draw(row,column,fraction){if(lost)throw new Error('Motion renderer context lost');gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,textures[row*4+column]);gl.uniform1f(locations[0],row);gl.uniform1f(locations[1],column);gl.uniform1f(locations[2],fraction);gl.drawArrays(gl.TRIANGLES,0,6);return surface;}};
}
