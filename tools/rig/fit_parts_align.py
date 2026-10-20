import json, numpy as np, cv2, pickle, base64, io
from PIL import Image
from fit_parts import PICK, fit, img
res={k:fit(k,*v) for k,v in PICK.items()}
orig=np.array(Image.open('/mnt/user-data/outputs/keepers/era1/enemies/enemy_grunt_walk0.png').convert('RGBA'))
def axis(alpha):
    ys,xs=np.nonzero(alpha>40); c=np.array([xs.mean(),ys.mean()]); cov=np.cov(np.vstack([xs-c[0],ys-c[1]]))
    w,v=np.linalg.eigh(cov); a=v[:,1]; return c, np.degrees(np.arctan2(a[1],a[0]))
def realign(k):
    im,x,y=res[k]; o,ox,oy=img(k)
    (oc,oa)=axis(np.array(o)[...,3]); oc=oc+[ox,oy]
    (gc,ga)=axis(np.array(im)[...,3]); gc=gc+[x,y]
    da=oa-ga
    while da>90: da-=180
    while da<-90: da+=180
    r=im.rotate(-da,resample=Image.BICUBIC,expand=True)
    # centre of the rotated image stays the image centre; place so centroids match
    cx,cy=im.width/2,im.height/2
    rel=gc-[x+cx,y+cy]; th=np.radians(da); rr=np.array([rel[0]*np.cos(th)-rel[1]*np.sin(th), rel[0]*np.sin(th)+rel[1]*np.cos(th)])
    newc=np.array([r.width/2,r.height/2])+rr
    res[k]=(r, oc[0]-newc[0], oc[1]-newc[1]); print(k,'rotated',round(da,1))
JOINT={'foreL':((410,390),(306,395)),'foreR':((712,470),(792,516))}
def attach(k):
    """Rotate and scale the forearm so its sleeve end sits on the shoulder and its other end on the wrist."""
    im,x,y=res[k]; a=np.array(im).astype(np.float32); m=a[...,3]>60
    ys,xs=np.nonzero(m); c=np.array([xs.mean(),ys.mean()]); cov=np.cov(np.vstack([xs-c[0],ys-c[1]])); w,v=np.linalg.eigh(cov); ax=v[:,1]
    t=(xs-c[0])*ax[0]+(ys-c[1])*ax[1]
    def end(sel):
        px=a[ys[sel],xs[sel],:3]; purple=(px[:,0]-px[:,1]).mean()   # the sleeve is purple: red above green
        return np.array([xs[sel].mean(),ys[sel].mean()]), purple
    lo,hi=t<np.percentile(t,12),t>np.percentile(t,88)
    (e1,p1),(e2,p2)=end(lo),end(hi)
    sleeve,wrist=(e1,e2) if p1>p2 else (e2,e1)
    S,Wr=map(np.array,JOINT[k])
    # the visible arm runs from just inside the sleeve to past the wrist joint
    dst_len=np.linalg.norm(Wr-S)*1.25; src_len=np.linalg.norm(wrist-sleeve)
    sc=dst_len/src_len
    ang=np.degrees(np.arctan2(*(Wr-S)[::-1])-np.arctan2(*(wrist-sleeve)[::-1]))
    M=cv2.getRotationMatrix2D((float(sleeve[0]),float(sleeve[1])),-ang,sc)
    # translate so the sleeve end lands a little inside the shoulder joint
    target=S+(Wr-S)/np.linalg.norm(Wr-S)*(-0.12*np.linalg.norm(Wr-S))
    canvas=1024
    M[:,2]+=target-sleeve-[x,y]+[x,y]
    out=cv2.warpAffine(a,M,(canvas,canvas),flags=cv2.INTER_LINEAR,borderValue=(0,0,0,0))
    # M maps image-local coords to image-local coords shifted so sleeve->target expressed in image space; place image at (0,0) of original space
    M2=M.copy(); M2[:,2]+=[0,0]
    res[k]=(Image.fromarray(np.clip(out,0,255).astype(np.uint8)),x- x,y- y) if False else None
    # simpler: build in original space directly
    T=np.array([[1,0,x],[0,1,y],[0,0,1]],float)
    R=cv2.getRotationMatrix2D((float(sleeve[0]+x),float(sleeve[1]+y)),-ang,sc); R=np.vstack([R,[0,0,1]])
    Tr=np.array([[1,0,target[0]-(sleeve[0]+x)],[0,1,target[1]-(sleeve[1]+y)],[0,0,1]],float)
    full=(Tr@R@T)[:2]
    out=cv2.warpAffine(a,full,(1024,1024),flags=cv2.INTER_LINEAR,borderValue=(0,0,0,0))
    o=Image.fromarray(np.clip(out,0,255).astype(np.uint8)); bb=o.getbbox()
    res[k]=(o.crop(bb),bb[0],bb[1]); print(k,'angle',round(ang,1),'scale',round(sc,2))
for k in ['foreL','foreR']: attach(k)
# trousers: pull the generated legs' colours to the original dark olive trousers
def match(k, ref_mask_poly_y=(640,830)):
    im,x,y=res[k]; a=np.array(im).astype(np.float32)
    o,ox,oy=img(k); oa=np.array(o).astype(np.float32)
    def lab(arr): return cv2.cvtColor(arr[...,:3].astype(np.uint8),cv2.COLOR_RGB2LAB).astype(np.float32)
    # trouser pixels: top 60% of each leg (above the shoe)
    def sel(arr):
        h=arr.shape[0]; m=arr[...,3]>200; m[int(h*0.72):]=False; return m
    gl,ol=lab(a),lab(oa); gm,om=sel(a),sel(oa)
    out=gl.copy()
    for c in range(3):
        g=gl[...,c][gm]; o_=ol[...,c][om]
        out[...,c][gm]=(g-g.mean())/(g.std()+1e-3)*o_.std()+o_.mean()
    rgb=cv2.cvtColor(np.clip(out,0,255).astype(np.uint8),cv2.COLOR_LAB2RGB)
    # blend softly so the shoe edge doesn't get a hard line
    h=a.shape[0]; wgt=np.clip((h*0.8-np.arange(h))/(h*0.06),0,1)[:,None]*(a[...,3]>0)
    a[...,:3]=a[...,:3]*(1-wgt[...,None])+rgb*wgt[...,None]
    res[k]=(Image.fromarray(a.astype(np.uint8)),x,y)
for k in ['legL','legR']: match(k)
pickle.dump({k:(np.array(v[0]),v[1],v[2]) for k,v in res.items()},open('fitted.pkl','wb'))
comp=Image.new('RGBA',(1024,1024),(255,255,255,255))
for k in ['legR','legL','foreR','handR','foreL','handL','torso','head']:
    im,x,y=res[k]; comp.alpha_composite(im,(int(round(x)),int(round(y))))
o=Image.new('RGBA',(1024,1024),(255,255,255,255)); o.alpha_composite(Image.fromarray(orig))
side=Image.new('RGB',(2048,1024),'white'); side.paste(o.convert('RGB')); side.paste(comp.convert('RGB'),(1024,0)); side.resize((1024,512)).save('fit_compare.png')
