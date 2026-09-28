import {writeFile} from 'node:fs/promises'
import {jobs} from '../../src/infrastructure/jobs.js'
const boss=await jobs()
const jobsTaken=await boss.fetch('media')
if(!jobsTaken.length)throw new Error('No queued job to claim')
await writeFile(process.argv[2],jobsTaken[0].id)
setInterval(()=>{},1000)
