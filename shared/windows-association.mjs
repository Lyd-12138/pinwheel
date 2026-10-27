export const documentTypes=[{id:'Pinwheel.Markdown',name:'风车笔记 Markdown 文档',extensions:['.md','.markdown']},{id:'Pinwheel.Encrypted',name:'风车笔记加密文档',extensions:['.pinwheel','.moye']},{id:'Pinwheel.Package',name:'风车笔记笔记包',extensions:['.notepack']}];
// Shared by the installer and the app's explicit association action.
export function windowsAssociationEntries(executable,{description='Offline Markdown notes',typeNames=documentTypes.map(t=>t.name)}={}){
 const entries=[],add=(key,name,value,type='REG_SZ')=>entries.push({key,name,value,type}),classes='Software\\Classes\\',icon=`"${executable}",0`,command=`"${executable}" "%1"`,name=`@${executable},-56001`,application=classes+'Applications\\'+executable.split(/[\\/]/).pop();
 for(const [i,t] of documentTypes.entries()){
  add(classes+t.id,'',typeNames[i]);add(classes+t.id+'\\DefaultIcon','',icon);add(classes+t.id+'\\shell\\open\\command','',command);add(classes+t.id+'\\Application','ApplicationName',name);add(classes+t.id+'\\Application','ApplicationIcon',icon);
  for(const ext of t.extensions){add(classes+ext+'\\OpenWithProgids',t.id,'');add(application+'\\SupportedTypes',ext,'');add('Software\\Pinwheel\\Capabilities\\FileAssociations',ext,t.id);}
 }
 add(application,'FriendlyAppName',name);add(application+'\\DefaultIcon','',icon,'REG_EXPAND_SZ');add(application+'\\shell\\open\\command','',command);
 add('Software\\Pinwheel\\Capabilities','ApplicationName',name);add('Software\\Pinwheel\\Capabilities','ApplicationDescription',description);add('Software\\Pinwheel\\Capabilities','ApplicationIcon',icon);add('Software\\RegisteredApplications','Pinwheel','Software\\Pinwheel\\Capabilities');add('Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\pinwheel.exe','',executable);
 return entries;
}
