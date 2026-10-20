# Maps each generated part back into the original zombie's 1024 px space, using the same transform that made its guide.
import json, base64, io, numpy as np, cv2
from PIL import Image
d=json.load(open('parts_data2.json'))
U='/mnt/user-data/uploads/dev/game-asset-mcp/assets/batches/'
def img(k):
    im=Image.open(io.BytesIO(base64.b64decode(d[k]['src'].split(',')[1]))).convert('RGBA')
    return im.resize((im.width*2,im.height*2),Image.LANCZOS), d[k]['x']*2, d[k]['y']*2
def clean_bbox(im):
    a=np.array(im); m=(a[...,3]>30).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(m,8); big=st[1:,cv2.CC_STAT_AREA].max(); keep=np.zeros_like(m,bool)
    for i in range(1,n):
        if st[i,cv2.CC_STAT_AREA]>big*0.03: keep|=lab==i
    ys,xs=np.nonzero(keep); return xs.min(),ys.min(),xs.max()+1,ys.max()+1
def merged_hand(side):
    h,hx,hy=img('hand'+side); parts=[(h,hx,hy)]+[img(k) for k in d if k.startswith('claw'+side)]
    x0=min(p[1] for p in parts); y0=min(p[2] for p in parts); x1=max(p[1]+p[0].width for p in parts); y1=max(p[2]+p[0].height for p in parts)
    o=Image.new('RGBA',(int(x1-x0),int(y1-y0)))
    for im,x,y in parts: o.alpha_composite(im,(int(x-x0),int(y-y0)))
    return o,x0,y0
def guide_transform(im,ox,oy,size,cleaned):
    """guide pixel = (orig - (ox+bx0)) * s + pad"""
    if cleaned: bx0,by0,bx1,by1=clean_bbox(im)
    else: bx0,by0,bx1,by1=0,0,im.width,im.height
    w,h=bx1-bx0,by1-by0; s=size/max(w,h); W,H=int(w*s),int(h*s)
    return s, (1024-W)//2 - (ox+bx0)*s, (1024-H)//2 - (oy+by0)*s
PICK={'head':('zombie-rig-2/head_v3.png','head',640,True),'torso':('zombie-rig-2/torso_v1.png','torso',640,True),
 'foreL':('zombie-rig-2/foreL_v1.png','foreL',520,True),'foreR':('zombie-rig-2/foreR_v3.png','foreR',520,True),
 'legL':('zombie-rig-2/legL_v1.png','legL',640,True),'legR':('zombie-rig-2/legR_v1.png','legR',640,True),
 'handL':('zombie-rig/handL_reach_v1.png','handL',700,False),'handL_rake':('zombie-rig/handL_rake_v1.png','handL',700,False),
 'handR':('zombie-rig-2/handR_reach_v3.png','handR',700,True)}
def fit(name, src, part, size, cleaned, extra=None):
    if part.startswith('hand'): im,ox,oy=merged_hand(part[-1])
    else: im,ox,oy=img(part)
    s,tx,ty=guide_transform(im,ox,oy,size,cleaned)
    g=Image.open(U+src if not src.startswith('/') else src).convert('RGBA')
    # generated pixel -> original: (g - t)/s ; original image is 1024 so resize gen by 1/s and place at -t/s
    bb=g.getbbox(); g=g.crop(bb)
    x0=(bb[0]-tx)/s; y0=(bb[1]-ty)/s; out=g.resize((max(1,round(g.width/s)),max(1,round(g.height/s))),Image.LANCZOS)
    return out,x0,y0
if __name__=='__main__':
    res={k:fit(k,*v) for k,v in PICK.items()}
    import pickle; pickle.dump({k:(np.array(v[0]),v[1],v[2]) for k,v in res.items()},open('fitted.pkl','wb'))
    comp=Image.new('RGBA',(1024,1024),(255,255,255,255))
    for k in ['legR','legL','foreR','handR','foreL','handL','torso','head']:
        im,x,y=res[k]; comp.alpha_composite(im,(int(round(x)),int(round(y))))
    orig=Image.open('/mnt/user-data/outputs/keepers/era1/enemies/enemy_grunt_walk0.png').convert('RGBA'); o=Image.new('RGBA',(1024,1024),(255,255,255,255)); o.alpha_composite(orig)
    side=Image.new('RGB',(2048,1024),'white'); side.paste(o.convert('RGB')); side.paste(comp.convert('RGB'),(1024,0)); side.resize((1024,512)).save('fit_compare.png')
    print({k:(v[0].size,round(v[1]),round(v[2])) for k,v in res.items()})
