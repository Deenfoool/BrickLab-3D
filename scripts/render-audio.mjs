import { synthesize } from '../assets/audio/recipes.js'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const samples=synthesize('music')
const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','f32le','-ar','24000','-ac','1','-i','pipe:0','-c:a','libvorbis','-q:a','4',fileURLToPath(new URL('../assets/audio/music/workbench.ogg',import.meta.url))],{input:Buffer.from(samples.buffer),maxBuffer:10e6})
if(result.status!==0)throw new Error(result.stderr?.toString()||result.error?.message)
