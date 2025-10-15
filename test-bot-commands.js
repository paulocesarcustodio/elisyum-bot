// Test simulating actual bot commands: play and yt
import { youtubeMedia, downloadYouTubeVideo } from './dist/utils/download.util.js';
import { convertMp4ToMp3 } from './dist/utils/convert.util.js';
import { convertVideoToThumbnail } from './dist/utils/convert.util.js';
import fs from 'fs';

console.log('🤖 Simulating Bot Commands: play and yt\n');
console.log('=' .repeat(60));

async function testPlayCommand() {
    console.log('\n🎵 TEST 1: Simulating "play" command (search + download + convert to MP3)');
    console.log('-'.repeat(60));
    
    try {
        const searchTerm = 'me at the zoo';
        console.log(`   Input: "${searchTerm}"`);
        
        // Step 1: Search video
        console.log('\n   📝 Step 1: Searching video...');
        const videoInfo = await youtubeMedia(searchTerm);
        console.log(`      ✅ Found: ${videoInfo.title}`);
        console.log(`      📊 Duration: ${videoInfo.duration_formatted}`);
        console.log(`      👤 Channel: ${videoInfo.channel}`);
        console.log(`      🆔 Video ID: ${videoInfo.id_video}`);
        
        // Check duration limit (360 seconds = 6 minutes)
        if (videoInfo.duration > 360) {
            console.log(`      ⚠️  Video too long (${videoInfo.duration}s > 360s)`);
            return false;
        }
        
        // Step 2: Download video
        console.log('\n   📥 Step 2: Downloading video...');
        const youtubeUrl = `https://www.youtube.com/watch?v=${videoInfo.id_video}`;
        const videoBuffer = await downloadYouTubeVideo(youtubeUrl);
        console.log(`      ✅ Downloaded: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        
        // Step 3: Convert to MP3
        console.log('\n   🎵 Step 3: Converting to MP3...');
        const audioBuffer = await convertMp4ToMp3('buffer', videoBuffer);
        console.log(`      ✅ Converted: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        
        // Validate MP3
        const isMp3 = audioBuffer.slice(0, 3).toString() === 'ID3' || audioBuffer[0] === 0xFF;
        if (!isMp3) {
            console.log('      ❌ Invalid MP3 file!');
            return false;
        }
        console.log('      ✅ Valid MP3 file');
        
        console.log('\n   ✅ "play" command simulation: SUCCESS');
        return true;
        
    } catch (error) {
        console.error(`\n   ❌ "play" command simulation: FAILED`);
        console.error(`   Error: ${error.message}`);
        return false;
    }
}

async function testYtCommand() {
    console.log('\n\n📹 TEST 2: Simulating "yt" command (URL + download + thumbnail)');
    console.log('-'.repeat(60));
    
    try {
        const videoUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
        console.log(`   Input: "${videoUrl}"`);
        
        // Step 1: Get video info
        console.log('\n   📝 Step 1: Getting video info...');
        const videoInfo = await youtubeMedia(videoUrl);
        console.log(`      ✅ Found: ${videoInfo.title}`);
        console.log(`      📊 Duration: ${videoInfo.duration_formatted}`);
        console.log(`      👤 Channel: ${videoInfo.channel}`);
        
        // Check duration limit
        if (videoInfo.duration > 360) {
            console.log(`      ⚠️  Video too long (${videoInfo.duration}s > 360s)`);
            return false;
        }
        
        // Step 2: Download video
        console.log('\n   📥 Step 2: Downloading video...');
        const youtubeUrl = `https://www.youtube.com/watch?v=${videoInfo.id_video}`;
        const videoBuffer = await downloadYouTubeVideo(youtubeUrl);
        console.log(`      ✅ Downloaded: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        
        // Step 3: Generate thumbnail (like WhatsApp does)
        console.log('\n   🖼️  Step 3: Generating thumbnail...');
        const thumbnailBase64 = await convertVideoToThumbnail('buffer', videoBuffer);
        console.log(`      ✅ Thumbnail generated: ${(thumbnailBase64.length / 1024).toFixed(2)} KB (base64)`);
        
        // Validate video (MP4 starts with ftyp at offset 4)
        const header = videoBuffer.slice(4, 8).toString();
        if (header !== 'ftyp') {
            console.log('      ❌ Invalid MP4 file!');
            return false;
        }
        console.log('      ✅ Valid MP4 file');
        
        console.log('\n   ✅ "yt" command simulation: SUCCESS');
        return true;
        
    } catch (error) {
        console.error(`\n   ❌ "yt" command simulation: FAILED`);
        console.error(`   Error: ${error.message}`);
        return false;
    }
}

// Run tests
(async () => {
    const playResult = await testPlayCommand();
    const ytResult = await testYtCommand();
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 TEST SUMMARY:');
    console.log(`   🎵 play command: ${playResult ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   📹 yt command:   ${ytResult ? '✅ PASS' : '❌ FAIL'}`);
    
    if (playResult && ytResult) {
        console.log('\n🎉 All tests passed! Bot is ready to use.');
        process.exit(0);
    } else {
        console.log('\n❌ Some tests failed. Please review the errors above.');
        process.exit(1);
    }
})();
