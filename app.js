const DOM_IDS=["projectInput","projectButton","projectStatus","folderInput","folderButton","folderStatus","logoInput","logoButton","logoStatus","sceneCount","requiredCount","matchedCount","missingCount","durationValue","validationStatus","missingDetails","missingList","canvas","durationSelect","qualitySelect","motionSelect","previewButton","renderButton","downloadWebmButton","convertButton","downloadMp4Button","progressBar","status","log"];
const el=Object.fromEntries(DOM_IDS.map(id=>[id,document.getElementById(id)]));
el.ctx=el.canvas.getContext("2d",{alpha:false});
const state={project:null,files:new Map(),images:new Map(),logo:null,webm:null,mp4:null,previewToken:0};
const CONFIG={width:1080,height:1350,fps:30};

el.projectButton.onclick=()=>el.projectInput.click();
el.folderButton.onclick=()=>el.folderInput.click();
el.logoButton.onclick=()=>el.logoInput.click();
el.projectInput.onchange=loadProject;
el.folderInput.onchange=loadFolder;
el.logoInput.onchange=loadLogo;
el.previewButton.onclick=preview;
el.renderButton.onclick=renderWebm;
el.downloadWebmButton.onclick=()=>downloadBlob(state.webm,"cxo-montage-master.webm");
el.convertButton.onclick=convertToMp4;
el.downloadMp4Button.onclick=()=>downloadBlob(state.mp4,"cxo-montage-linkedin.mp4");

drawEmpty("Load project and images");

async function loadProject(event){
  try{
    state.project=JSON.parse(await event.target.files[0].text());
    if(!Array.isArray(state.project.scenes)||!state.project.photoNames)throw new Error("Unsupported project format");
    el.projectStatus.textContent=`${state.project.scenes.length} scenes · saved ${new Date(state.project.savedAt).toLocaleString()}`;
    el.sceneCount.textContent=state.project.scenes.length;
    el.durationValue.textContent=`${state.project.settings?.duration||120}s`;
    log("Project JSON loaded successfully.");
    await validate();
  }catch(error){setStatus(`Project error: ${error.message}`,true)}
}

async function loadFolder(event){
  state.files.clear();
  for(const file of event.target.files){
    if(file.type.startsWith("image/"))state.files.set(file.name,file);
  }
  el.folderStatus.textContent=`${state.files.size} image files available`;
  log(`Image folder loaded: ${state.files.size} files.`);
  await validate();
}

async function loadLogo(event){
  const file=event.target.files[0];
  if(!file)return;
  state.logo=await decodeFile(file);
  el.logoStatus.textContent=file.name;
  log("Logo loaded.");
  drawFirstScene();
}

async function validate(){
  if(!state.project||!state.files.size)return;
  const requiredNames=[...new Set(state.project.scenes.flatMap(scene=>scene.frames.map(frame=>state.project.photoNames[frame.photoId])).filter(Boolean))];
  const missing=requiredNames.filter(name=>!state.files.has(name));
  el.requiredCount.textContent=requiredNames.length;
  el.matchedCount.textContent=requiredNames.length-missing.length;
  el.missingCount.textContent=missing.length;
  el.missingDetails.hidden=!missing.length;
  el.missingList.textContent=missing.join("\n");
  if(missing.length){
    el.validationStatus.className="notice bad";
    el.validationStatus.textContent=`Cannot render yet. ${missing.length} required image filenames are missing.`;
    el.previewButton.disabled=true;el.renderButton.disabled=true;return;
  }
  el.validationStatus.className="notice good";
  el.validationStatus.textContent="Validation passed. Every saved frame has a matching image file.";
  el.previewButton.disabled=false;el.renderButton.disabled=false;
  await preloadRequired(requiredNames);
  drawFirstScene();
}

async function preloadRequired(names){
  state.images.clear();
  for(let i=0;i<names.length;i++){
    const name=names[i];state.images.set(name,await decodeFile(state.files.get(name)));
    setProgress((i+1)/names.length*.1);setStatus(`Decoding images ${i+1}/${names.length}`);
    if(i%10===0)await nextFrame();
  }
  setProgress(0);setStatus("Ready to preview or render.");log(`Decoded ${names.length} required images.`);
}

function decodeFile(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>resolve({img,url});img.onerror=()=>reject(new Error(`Could not decode ${file.name}`));img.src=url})}
function drawFirstScene(){if(state.project?.scenes?.length)drawScene(state.project.scenes[0],1,false);else drawEmpty("Load project and images")}

async function preview(){
  if(!state.project||!state.images.size)return;
  const token=++state.previewToken,count=Math.min(5,state.project.scenes.length),per=2,start=performance.now();
  el.previewButton.textContent="Stop preview";
  el.previewButton.onclick=()=>{state.previewToken++;el.previewButton.textContent="Preview first 5 scenes";el.previewButton.onclick=preview;drawFirstScene()};
  function tick(now){
    if(token!==state.previewToken)return;
    const seconds=(now-start)/1000,index=Math.min(count-1,Math.floor(seconds/per)),progress=(seconds%per)/per;
    drawScene(state.project.scenes[index],progress,false);
    if(seconds<count*per)requestAnimationFrame(tick);else{el.previewButton.textContent="Preview first 5 scenes";el.previewButton.onclick=preview;drawFirstScene()}
  }
  requestAnimationFrame(tick);
}

async function renderWebm(){
  state.webm=null;state.mp4=null;el.downloadWebmButton.disabled=true;el.convertButton.disabled=true;el.downloadMp4Button.disabled=true;
  const mime=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(MediaRecorder.isTypeSupported);
  if(!mime)return setStatus("This browser cannot encode WebM. Use current Edge or Chrome.",true);
  const duration=selectedDuration(),secondsPerScene=duration/state.project.scenes.length,chunks=[];
  let recorder;
  try{recorder=new MediaRecorder(el.canvas.captureStream(CONFIG.fps),{mimeType:mime,videoBitsPerSecond:Number(el.qualitySelect.value)})}catch(error){return setStatus(`Could not start encoder: ${error.message}`,true)}
  el.renderButton.disabled=true;el.previewButton.disabled=true;log(`WebM render started: ${duration}s, ${mime}.`);
  recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data)};
  recorder.onerror=event=>{el.renderButton.disabled=false;setStatus(`Encoder error: ${event.error?.message||"unknown"}`,true)};
  recorder.onstop=()=>{
    el.renderButton.disabled=false;el.previewButton.disabled=false;
    if(!chunks.length)return setStatus("Render produced no video data.",true);
    state.webm=new Blob(chunks,{type:mime});
    el.downloadWebmButton.disabled=false;el.convertButton.disabled=false;
    setProgress(1);setStatus(`WebM master ready: ${formatBytes(state.webm.size)}. Downloading now.`);log(`WebM complete: ${formatBytes(state.webm.size)}.`);
    downloadBlob(state.webm,"cxo-montage-master.webm");drawFirstScene();
  };
  recorder.start(1000);
  const started=performance.now();
  function frame(now){
    const seconds=(now-started)/1000,index=Math.min(state.project.scenes.length-1,Math.floor(seconds/secondsPerScene)),sceneProgress=(seconds-index*secondsPerScene)/secondsPerScene;
    drawScene(state.project.scenes[index],Math.min(1,sceneProgress),false);
    const progress=Math.min(1,seconds/duration);setProgress(progress);setStatus(`Rendering WebM ${Math.round(progress*100)}% · keep this tab open`);
    if(seconds<duration)requestAnimationFrame(frame);else{setStatus("Finalising WebM master...");setTimeout(()=>recorder.stop(),400)}
  }
  requestAnimationFrame(frame);
}

async function convertToMp4(){
  if(!state.webm)return;
  el.convertButton.disabled=true;el.downloadMp4Button.disabled=true;setStatus("Loading FFmpeg WebAssembly...");log("Starting FFmpeg MP4 conversion.");
  try{
    const [{FFmpeg},{toBlobURL,fetchFile}]=await Promise.all([import("https://esm.sh/@ffmpeg/ffmpeg@0.12.10"),import("https://esm.sh/@ffmpeg/util@0.12.1")]);
    const ffmpeg=new FFmpeg();
    ffmpeg.on("log",({message})=>log(message));
    ffmpeg.on("progress",({progress})=>{setProgress(progress);setStatus(`Converting to MP4 ${Math.round(progress*100)}%`)});
    const base="https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
    await ffmpeg.load({coreURL:await toBlobURL(`${base}/ffmpeg-core.js`,"text/javascript"),wasmURL:await toBlobURL(`${base}/ffmpeg-core.wasm`,`application/wasm`)});
    await ffmpeg.writeFile("input.webm",await fetchFile(state.webm));
    await ffmpeg.exec(["-i","input.webm","-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p","-movflags","+faststart","-an","output.mp4"]);
    const data=await ffmpeg.readFile("output.mp4");
    state.mp4=new Blob([data.buffer],{type:"video/mp4"});
    el.downloadMp4Button.disabled=false;setProgress(1);setStatus(`MP4 ready: ${formatBytes(state.mp4.size)}. Downloading now.`);log(`MP4 complete: ${formatBytes(state.mp4.size)}.`);
    downloadBlob(state.mp4,"cxo-montage-linkedin.mp4");
  }catch(error){
    setStatus(`MP4 conversion failed: ${error.message}. The WebM master is still available.`,true);log(error.stack||error.message);
  }finally{el.convertButton.disabled=false}
}

function drawScene(scene,progress){
  drawBackground(progress);
  [...scene.frames].sort((a,b)=>a.z-b.z).forEach(frame=>{
    const name=state.project.photoNames[frame.photoId],asset=state.images.get(name);if(asset)drawFrame(asset.img,frame,progress);
  });
  drawLogo();
}
function drawBackground(progress){const c=el.ctx,g=c.createLinearGradient(0,0,CONFIG.width,CONFIG.height);g.addColorStop(0,"#132949");g.addColorStop(1,"#071327");c.fillStyle=g;c.fillRect(0,0,CONFIG.width,CONFIG.height);c.save();c.globalAlpha=.2;c.strokeStyle="#31859d";for(let i=0;i<10;i++){const x=(i*150+progress*100)%1200-100,y=i*130;c.beginPath();c.moveTo(x,y);c.lineTo(x+300,y+65);c.stroke()}c.restore()}
function drawFrame(image,frame,progress){const c=el.ctx,motion=getMotion(progress,frame.z),iw=image.naturalWidth,ih=image.naturalHeight;c.save();c.translate(motion.x,motion.y);rounded(c,frame.x,frame.y,frame.w,frame.h,18);c.clip();const base=frame.fit==="fit"?Math.min(frame.w/iw,frame.h/ih):Math.max(frame.w/iw,frame.h/ih),scale=base*(frame.zoom||1)*(1+progress*.025),dw=iw*scale,dh=ih*scale;if(frame.fit==="fit"){const bs=Math.max(frame.w/iw,frame.h/ih)*1.08,bw=iw*bs,bh=ih*bs;c.save();c.globalAlpha=.5;c.filter="blur(24px)";c.drawImage(image,frame.x+(frame.w-bw)/2,frame.y+(frame.h-bh)/2,bw,bh);c.restore()}c.drawImage(image,frame.x+(frame.w-dw)*(frame.fx??.5),frame.y+(frame.h-dh)*(frame.fy??.5),dw,dh);c.restore()}
function getMotion(progress,index){const remaining=1-Math.max(0,Math.min(1,progress)),setting=el.motionSelect.value==="project"?(state.project.settings?.motion||"dynamic"):el.motionSelect.value;if(setting==="elegant")return{x:0,y:remaining*28};if(setting==="dynamic")return{x:remaining*(index%2?-48:48),y:0};return{x:0,y:remaining*48}}
function rounded(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,Math.min(r,w/2,h/2))}
function drawLogo(){if(!state.logo)return;const width=Number(state.project.settings?.logoSize||180),height=width*state.logo.img.naturalHeight/state.logo.img.naturalWidth,top=Number(state.project.settings?.logoTop||14);el.ctx.drawImage(state.logo.img,(CONFIG.width-width)/2,top,width,height)}
function drawEmpty(text){drawBackground(0);el.ctx.fillStyle="#ffffffbb";el.ctx.font="34px Barlow";el.ctx.textAlign="center";el.ctx.fillText(text,CONFIG.width/2,CONFIG.height/2);el.ctx.textAlign="start"}
function selectedDuration(){return el.durationSelect.value==="project"?Number(state.project.settings?.duration||120):Number(el.durationSelect.value)}
function downloadBlob(blob,name){if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),300000)}
function setProgress(value){el.progressBar.style.width=`${Math.round(Math.max(0,Math.min(1,value))*100)}%`}
function setStatus(message,error=false){el.status.textContent=message;el.status.style.color=error?"#ff8585":""}
function log(message){el.log.textContent+=`${new Date().toLocaleTimeString()}  ${message}\n`;el.log.scrollTop=el.log.scrollHeight}
function nextFrame(){return new Promise(resolve=>requestAnimationFrame(resolve))}
function formatBytes(bytes){if(bytes<1024*1024)return`${(bytes/1024).toFixed(1)} KB`;return`${(bytes/1024/1024).toFixed(1)} MB`}
