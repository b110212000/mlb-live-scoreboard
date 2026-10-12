// 引擎測試用：在每個 vm context 放入與 scripts/engine-plugin.mjs 相同的多國語系預設函式（繁體中文）。
// t() 回傳中文原文並代入參數，所以既有的中文斷言不受影響。
const PRELUDE=[
  "function t(text,params){return params?String(text).replace(/\\{(\\w+)\\}/g,function(match,name){return params[name]!=null?String(params[name]):match}):text}",
  "function lang(){return 'zh'}",
  "function locale(){return 'zh-TW'}",
  "function teamName(team){return ''}"
].join('\n');

module.exports=function installI18nStub(vm){
  const create=vm.createContext;
  vm.createContext=function(context,...rest){
    const result=create.call(vm,context,...rest);
    // 測試自己提供的函式（例如 teamName）優先。
    const defined=new Set(Object.keys(result));
    vm.runInContext(PRELUDE.split('\n').filter(line=>!defined.has(/^function (\w+)/.exec(line)[1])).join('\n'),result);
    return result;
  };
};
