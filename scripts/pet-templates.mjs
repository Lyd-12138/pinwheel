import fs from 'node:fs/promises';
import { writePetPackage } from '../desktop/pet-package.mjs';
import { petGuide } from '../shared/pet-guide.mjs';
await fs.mkdir('pet-examples', {recursive:true});
await fs.writeFile('pet-examples/宠物制作指南.md',petGuide);
const examples=[
 ['部件定制示例.pinwheel-pet',{name:'围巾小橘',kind:'fox',color:'#eaa16c',appearance:{accent:'#9bc7c3',outline:'#4e4248',bodyWidth:1.1,bodyHeight:.95,earSize:1.05,eyeSize:1.1,eyeDistance:1,accessory:'scarf',pattern:'spots',expression:'happy'},behavior:{click:'pet',doubleClick:'play',showSpeech:true,messages:{pet:['你好呀，再摸摸～'],feed:['谢谢你的点心！'],sleep:['休息一会儿……']}}}],
 ['空白制作模板.pinwheel-pet',{name:'我的伙伴',kind:'cat',color:'#a899ed'}]
];
for(const [name,pet] of examples)await fs.writeFile('pet-examples/'+name,await writePetPackage(pet,async()=>{throw Error('No assets expected');},petGuide));
console.log('Pet examples generated.');
