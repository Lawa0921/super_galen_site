/** esbuild bundling shared by the production performance harness. */
import {build} from 'esbuild';
/** Vite replaces import.meta.env at build time; mirror a production build so
 * DEV-only branches (e.g. the e2e debug hook) are folded away, not crash. */
export const PRODUCTION_ENV_DEFINE:Record<string,string>={
  'import.meta.env.DEV':'false','import.meta.env.PROD':'true','import.meta.env.MODE':'"production"','import.meta.env.SSR':'false','import.meta.env.BASE_URL':'"/"',
  'import.meta.env':'{"DEV":false,"PROD":true,"MODE":"production","SSR":false,"BASE_URL":"/"}',
};
export async function bundlePerfFixture(contents:string,resolveDir:string):Promise<Uint8Array>{
  const output=await build({stdin:{contents,resolveDir,loader:'ts'},bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',write:false,define:PRODUCTION_ENV_DEFINE});
  return output.outputFiles[0].contents;
}
