from pathlib import Path
from PIL import Image,ImageDraw
root=Path.cwd()/'assets';root.mkdir(exist_ok=True)
image=Image.new('RGBA',(1024,1024),(0,0,0,0));d=ImageDraw.Draw(image)
d.rounded_rectangle((36,36,988,988),radius=235,fill='#f7f5ed')
d.rounded_rectangle((76,76,948,948),radius=200,outline='#dce3ef',width=8)
d.line([(512,500),(512,853)],fill='#435675',width=25)
d.ellipse((499,839,525,865),fill='#435675')
blade=[(512,478),(539,175),(783,229),(620,418)]
colors=['#315fd1','#7396e8','#a8bef2','#4a78df']
for turn,color in enumerate(colors):
 points=[]
 for x,y in blade:
  a,b=x-512,y-478
  for _ in range(turn):a,b=-b,a
  points.append((512+a,478+b))
 d.polygon(points,fill=color)
d.ellipse((468,434,556,522),fill='#f59b77',outline='#f7f5ed',width=10)
image.save(root/'pinwheel.png');image.save(root/'pinwheel.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)]);image.save(root/'pinwheel.icns')
