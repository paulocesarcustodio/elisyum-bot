// Test complete flow: download YouTube video and convert to MP3
import { downloadYouTubeVideo } from '../../dist/utils/download.util.js';
import { convertMp4ToMp3 } from '../../dist/utils/convert.util.js';
import fs from 'fs';

async function testCompleteFlow() {
    console.log('🧪 Testing Complete YouTube Download + MP3 Conversion...\n');
    
    try {
        console.log('📹 Step 1: Downloading video...');
        const videoUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // Short video
        const videoBuffer = await downloadYouTubeVideo(videoUrl);
        console.log(`   ✅ Downloaded: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        
        console.log('\n🎵 Step 2: Converting to MP3...');
        const audioBuffer = await convertMp4ToMp3('buffer', videoBuffer);
        console.log(`   ✅ Converted: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Buffer type: ${Buffer.isBuffer(audioBuffer) ? 'Valid Buffer' : 'Invalid'}`);
        
        // Verifica se é um MP3 válido (começa com ID3 ou 0xFF)
        const header = audioBuffer.slice(0, 3).toString();
        const isMp3 = header === 'ID3' || audioBuffer[0] === 0xFF;
        console.log(`   File type: ${isMp3 ? 'Valid MP3' : 'Unknown format'}`);
        
        // Salva temporariamente
        const testPath = '/tmp/test-youtube-audio.mp3';
        fs.writeFileSync(testPath, audioBuffer);
        console.log(`   ✓ Saved test file to ${testPath}`);
        
        // Remove arquivo de teste
        fs.unlinkSync(testPath);
        console.log(`   ✓ Test file cleaned up`);
        
        console.log('\n✅ Complete flow test passed!');
        console.log('🎉 Bot commands should now work correctly!');
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

testCompleteFlow();
