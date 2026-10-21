self.__io$config = {
  prefix: "./s/",
  encodeUrl: Nova.codec.xor.encode,
  decodeUrl: Nova.codec.xor.decode,
  handler: "./a/hook.js",
  client: "./a/view.js",
  bundle: "./a/core.js",
  config: "./a/cfg.js",
  sw: "./a/work.js",
  inject: [
    {
      host: ".*",
      injectTo: "head",
      html: '<script>try{Object.defineProperty(window,"frameElement",{get:function(){return null},configurable:true});var n=PluginArray.prototype.namedItem;PluginArray.prototype.namedItem=function(x){return /pdf/i.test(String(x))?null:n.apply(this,arguments)}}catch(e){}</script>',
    },
  ],
};
