import * as T from "three";

// Dash and Juno share the tested bone hierarchy, not Gus's costume or silhouette.
// All surfaces, including garment openings and shoulder straps, have real depth.
export function sculptCrew(kind, ctx, surfaces) {
  const { root, head, spine, chest, mesh, loft, seam, materials, skinned } = ctx;
  const { volume, detail, surfaceZ, faceRows, smoothLoft } = surfaces;
  const juno = kind === "juno";
  const remove = (pattern) => {
    const nodes = [];
    root.traverse((o) => { if (o.isMesh && pattern.test(o.name)) nodes.push(o); });
    nodes.forEach((o) => o.removeFromParent());
  };
  const material = (name, color) => {
    materials[name] = new T.MeshStandardMaterial({ color, roughness: 1 });
    materials[name].name = name;
  };
  material("undershirt", juno ? "#91b9b5" : "#eee4ce");
  material("jacket", juno ? "#62536f" : "#e95b13");
  material("jacketEdge", juno ? "#40384e" : "#aa3711");
  material("bag", "#252c2d");
  material("bagEdge", "#485052");
  material("lip", juno ? "#a14b46" : "#914d36");
  material("shoeAccent", juno ? "#555d62" : "#cf382c");
  material("rubber", "#e3ddcc");
  materials.hair.color.set(juno ? "#39271f" : "#171c21");
  materials.skin.color.set(juno ? "#efb08d" : "#edab7e");
  materials.pants.color.set(juno ? "#38444d" : "#292e33");
  materials.boot.color.set(juno ? "#252c31" : "#eee7d7");
  materials.sole.color.set("#e0d9c8");
  remove(/^(Moustache|MouthCrease|CrownSweep|RearSweep|TempleSweep|LeftSweep|ForelockVolume|SideburnVolume|WorkShirtVolume|Button|Pocket|Collar|Neckerchief|LeatherBelt)/);

  // Smile/lips lie on the curved muzzle; no rectangular texture projection.
  if (juno) {
    detail(head, "UpperLip", [[-.082,-.15],[-.027,-.132],[0,-.141],[.027,-.13],[.085,-.145],[.028,-.158],[-.03,-.16]], faceRows, "lip", .008, true);
    detail(head, "LowerLip", [[-.075,-.151],[0,-.17],[.07,-.149],[.035,-.177],[-.022,-.181]], faceRows, "lip", .007, true);
    for (const s of [-1,1]) {
      detail(head, "Lash"+s, [[s*.051,.054],[s*.185,.05],[s*.211,.071],[s*.191,.028],[s*.06,.04]], faceRows,"hair",.017,true);
      const brow = root.getObjectByName("HeavyBrow"+s);
      const p = brow.geometry.attributes.position;
      for (let i=0;i<p.count;i++) p.setY(i,.112+(p.getY(i)-.112)*.55);
      brow.geometry.computeVertexNormals();
    }
  } else {
    detail(head,"SmileOutline",[[-.115,-.115],[-.03,-.142],[.105,-.117],[.073,-.184],[-.015,-.195],[-.081,-.167]],faceRows,"ink",.006,true);
    detail(head,"SmileTeeth",[[-.098,-.123],[-.023,-.148],[.09,-.127],[.063,-.162],[-.01,-.176],[-.073,-.155]],faceRows,"eye",.009,true);
  }
  // Bob: open-front, closed shell; its rear curtain is continuous with the cap.
  // Dash has an asymmetric lifted quiff and a short nape instead.
  function shell(parent, name, rows, mat, opening, thickness = .014) {
    const count=48, p=[], ids=[];
    for(let layer=0;layer<2;layer++) for(const [y,rx,rz,cz=0] of rows) {
      const gap = typeof opening === "function" ? opening(y) : opening;
      for(let i=0;i<=count;i++) {
        const a=gap+(Math.PI*2-gap*2)*i/count;
        const s=Math.sin(a),c=Math.cos(a);
        p.push(Math.sign(s)*Math.abs(s)**.68*(rx-layer*thickness),y,Math.sign(c)*Math.abs(c)**.62*(rz-layer*thickness)+cz);
      }
    }
    const stride=count+1, total=rows.length*stride;
    for(let l=0;l<2;l++) for(let r=0;r<rows.length-1;r++) for(let i=0;i<count;i++) {
      const a=l*total+r*stride+i,b=a+1,c=a+stride,d=c+1;
      ids.push(...(l ? [a,c,b,b,c,d] : [a,b,c,b,d,c]));
    }
    const quad=(a,b)=>ids.push(a,a+total,b,b,a+total,b+total);
    for(let i=0;i<count;i++){quad(i+1,i);quad(total-stride+i,total-stride+i+1);}
    for(let r=0;r<rows.length-1;r++){quad(r*stride,(r+1)*stride);quad((r+1)*stride+count,r*stride+count);}
    const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(p,3));g.setIndex(ids);g.computeVertexNormals();
    return mesh(parent,name,g,mat);
  }
  if(juno){
    shell(head,"BobCurtain",[[-.30,.255,.205,-.026],[-.22,.298,.245,-.025],[-.07,.302,.264,-.02],[.12,.295,.259,-.018],[.24,.267,.236,-.02]],"hair",.95,.025);
    for(const [name,rows] of [
      ["PartedFringeL",[[.06,.014,.02,.199,-.215],[.16,.055,.055,.208,-.15],[.26,.105,.07,.15,-.08],[.335,.065,.065,.06,-.035]]],
      ["PartedFringeR",[[-.21,.008,.014,.13,.248],[-.04,.045,.055,.18,.247],[.14,.065,.061,.20,.19],[.28,.09,.066,.13,.085],[.34,.025,.03,.04,.025]]],
    ]) mesh(head,name,smoothLoft(rows),"hair");
  }else{
    for(const [name,rows] of [
      ["QuiffMain",[[.23,.18,.13,0,-.07],[.32,.19,.13,-.01,-.025],[.43,.11,.08,-.035,.07],[.51,.002,.002,-.065,.14]]],
      ["QuiffRear",[[.23,.16,.10,-.12,.06],[.33,.14,.10,-.14,.13],[.43,.002,.002,-.19,.25]]],
      ["QuiffFront",[[.09,.006,.013,.22,.105],[.2,.051,.033,.23,.10],[.3,.105,.063,.17,.035],[.4,.02,.025,.08,-.03]]],
      ["TempleLock",[[.0,.014,.03,.03,-.246],[.15,.035,.065,.01,-.26],[.29,.016,.025,-.035,-.28]]],
    ]) mesh(head,name,smoothLoft(rows),"hair");
  }
  // Subtle distinct jaw proportions, with the face details following the skin.
  head.traverse(o=>{
    if(!o.isMesh)return;
    const p=o.geometry.attributes.position;
    // Ear geometry uses object-local scale/translation; leave those small volumes intact.
    if(/Ear/.test(o.name))return;
    for(let i=0;i<p.count;i++) {
      const y=p.getY(i), jaw=T.MathUtils.smoothstep(-y,.08,.26);
      p.setX(i,p.getX(i)*(juno ? .94-jaw*.13 : .96-jaw*.07));
    }
    o.geometry.computeVertexNormals();
  });

  const rows=[[-.035,.267,.174],[.10,.258,.174],[.25,.279,.182],[.40,.311,.18],[.51,.33,.157],[.58,.27,.133],[.62,.12,.102]];
  volume(spine,"UndershirtVolume",rows,false,"undershirt");
  // Outer jacket and its lining are separate from the T-shirt, including open edges.
  const jacketRows=rows.filter(r=>r[0] >= (juno ? .10 : -.04)).map(([y,x,z])=>[y,x+.019,z+.024]);
  shell(spine,"JacketVolume",jacketRows,"jacket",y=>y>.5?.65:.46);
  for(const s of [-1,1]) {
    const edge=rows.filter(r=>r[0]>=(juno?.10:-.04)).map(([y,x,z])=>{
      const a=y>.5?.65:.46;return[s*Math.sin(a)**.68*(x+.021),y,Math.cos(a)**.62*(z+.024)+.005];
    });
    seam(spine,"JacketPiping"+s,edge,.008,"jacketEdge");
    detail(spine,"JacketLapel"+s,[[s*.11,.60],[s*.19,.55],[s*.24,.43],[s*.20,.46],[s*.145,.39]],rows,"jacketEdge",.045);
  }
  const pocketY=juno?.36:.22;
  detail(spine,"JacketChestPocket",[[-.26,pocketY+.075],[-.14,pocketY+.075],[-.14,pocketY-.055],[-.24,pocketY-.062]],rows,"jacketEdge",.028);
  detail(spine,"JacketPocketFabric",[[-.25,pocketY+.064],[-.15,pocketY+.064],[-.15,pocketY-.044],[-.235,pocketY-.05]],rows,"jacket",.031);
  // Tailored full sleeves for Dash; Juno's rolled sleeves end just below the elbow.
  for(const [s,side] of [[-1,"L"],[1,"R"]]) {
    remove(new RegExp(`^(Sleeve${side}|SleeveCuff${side}|CuffLine${side})(_ink)?$`));
    const arm=root.getObjectByName("Arm"+side), elbow=root.getObjectByName("Forearm"+side);
    arm.position.x=s*.323;
    remove(new RegExp(`^ArmSkin${side}$`));
    if(juno)skinned(arm,"ArmSkin"+side,[[-.49,.10,.09],[-.58,.10,.09],[-.72,.078,.072],[-.84,.064,.06]],"skin",[arm,elbow],.43);
    const sleeveRows=[[.005,.096,.112],[-.07,.126,.126],[-.2,.122,.119],[-.33,.105,.109],[-.43,.104,.107],[-.51,.10,.102]];
    if(!juno)sleeveRows.push([-.65,.082,.079],[-.79,.07,.067],[-.84,.066,.062]);
    skinned(arm,"JacketSleeve"+side,sleeveRows,"jacket",[arm,elbow],.43);
    const cuffY=juno?-.09:-.40;
    mesh(elbow,"JacketCuff"+side,loft([[cuffY+.03,juno?.106:.072,juno?.108:.069],[cuffY-.025,juno?.106:.072,juno?.108:.069]],24),"jacketEdge");
    root.getObjectByName("Hand"+side).scale.set(.94,1,.94);
    for(const name of ["TrouserLeg"+side,"TrouserLeg"+side+"_ink"]) {
      const m=root.getObjectByName(name),p=m.geometry.attributes.position;
      for(let i=0;i<p.count;i++) {
        const y=p.getY(i),t=T.MathUtils.smoothstep(-y,.25,1.2);
        p.setX(i,p.getX(i)*(juno?1.0+t*.52:.86));
        p.setZ(i,p.getZ(i)*(juno?1+t*.13:.95));
      }
      m.geometry.computeVertexNormals();
    }
    // Sneakers keep the tested sole envelope and foot bones.
    root.getObjectByName("BootAnkle"+side).scale.y=.45;
    for(let i=0;i<3;i++)root.getObjectByName("Lace"+side+i).material=materials.rubber;
    const foot=root.getObjectByName("Foot"+side);
    mesh(foot,"HeelAccent"+side,loft([[-.08,.111,.03,-.09],[.035,.101,.028,-.085]],24),"shoeAccent");
    seam(foot,"ToeStitch"+side,[[-.09,-.041,.16],[-.065,-.015,.21],[0,-.008,.235],[.065,-.015,.21],[.09,-.041,.16]],.0035,"shoeAccent");
    if(juno){
      const thigh=root.getObjectByName("Thigh"+side);
      mesh(thigh,"CargoPocket"+side,loft([[-.44,.055,.019,.119,s*.06],[-.40,.065,.023,.121,s*.06],[-.22,.065,.02,.128,s*.06]],20,.55),"pants");
      seam(thigh,"CargoFlap"+side,[[s*.005,-.245,.153],[s*.06,-.26,.157],[s*.12,-.245,.143]],.004,"bagEdge");
    }
  }
  if(!juno) {
    // A broad strap follows the torso front/back and joins over the shoulder.
    const strapPoints=[[-.27,.55,-.16],[-.3,.57,.02],[-.25,.51,.22],[-.13,.36,.235],[.02,.20,.225],[.18,.04,.215],[.29,.04,.04],[.18,.18,-.227],[0,.37,-.23],[-.27,.55,-.16]];
    const curve=new T.CatmullRomCurve3(strapPoints.map(p=>new T.Vector3(...p)));
    const p=[],idx=[];
    for(let i=0;i<=96;i++){
      const t=i/96,c=curve.getPoint(t),tangent=curve.getTangent(t);
      const width=new T.Vector3(-tangent.y,tangent.x,0).normalize().multiplyScalar(.031);
      for(const s of [-1,1])p.push(...c.clone().addScaledVector(width,s).toArray());
      if(i<96){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();
    const strap=mesh(spine,"CourierStrap",g,"bag");strap.material.side=T.DoubleSide;
    const bag=mesh(spine,"CourierBag",smoothLoft([[.08,.07,.045,.24,.085],[.12,.145,.069,.25,.065],[.26,.14,.071,.25,.035],[.30,.08,.04,.24,.01]]),"bag");
    seam(spine,"BagZip",[[-.075,.255,.30],[.025,.26,.322],[.135,.235,.29]],.005,"bagEdge");
    mesh(spine,"ZipPull",loft([[.207,.008,.004],[.238,.008,.004]],10),"metal",[.13,0,.304]);
    bag.userData.role="Runner crossbody bag";
  }
  // Narrow contour hulls on the newly authored closed volumes only.
  const sources=[];
  root.traverse(o=>{if(o.isMesh && /^(BobCurtain|PartedFringe|Quiff|TempleLock|JacketVolume|CourierBag)/.test(o.name))sources.push(o);});
  for(const src of sources){
    const g=src.geometry.clone(),p=g.attributes.position,n=g.attributes.normal;
    for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)+n.getX(i)*.0035,p.getY(i)+n.getY(i)*.0035,p.getZ(i)+n.getZ(i)*.0035);
    const idx=g.index.array;for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];
    const o=new T.Mesh(g,new T.MeshBasicMaterial({color:"#202226"}));o.name=src.name+"_ink";o.position.copy(src.position);src.parent.add(o);
  }
  root.updateMatrixWorld(true);
}
