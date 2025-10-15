// Inspect yt-dlp-wrap module structure
async function inspect() {
    console.log('=== Inspecting yt-dlp-wrap module ===');
    
    const YTDlpModule = await import('yt-dlp-wrap');
    
    console.log('\n1. Module type:', typeof YTDlpModule);
    console.log('\n2. Module keys:', Object.keys(YTDlpModule));
    console.log('\n3. Module.default type:', typeof YTDlpModule.default);
    console.log('\n4. Module.default keys:', YTDlpModule.default ? Object.keys(YTDlpModule.default) : 'N/A');
    console.log('\n5. Module.YTDlpWrap type:', typeof YTDlpModule.YTDlpWrap);
    
    console.log('\n6. All module properties:');
    for (const key in YTDlpModule) {
        console.log(`   - ${key}: ${typeof YTDlpModule[key]}`);
    }
    
    console.log('\n7. Module.default properties (if object):');
    if (typeof YTDlpModule.default === 'object' && YTDlpModule.default) {
        for (const key in YTDlpModule.default) {
            console.log(`   - ${key}: ${typeof YTDlpModule.default[key]}`);
        }
    }
    
    console.log('\n8. Trying to instantiate:');
    const ytDlpPath = '/home/paulo/dev/elisyum-bot/yt-dlp';
    
    try {
        console.log('   Trying YTDlpModule.default...');
        const instance1 = new YTDlpModule.default(ytDlpPath);
        console.log('   ✓ SUCCESS with YTDlpModule.default');
        console.log('   Instance methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(instance1)));
        return;
    } catch (e) {
        console.log('   ✗ Failed:', e.message);
    }
    
    try {
        console.log('   Trying YTDlpModule itself...');
        const instance2 = new YTDlpModule(ytDlpPath);
        console.log('   ✓ SUCCESS with YTDlpModule');
        return;
    } catch (e) {
        console.log('   ✗ Failed:', e.message);
    }
    
    try {
        console.log('   Trying YTDlpModule.YTDlpWrap...');
        const instance3 = new YTDlpModule.YTDlpWrap(ytDlpPath);
        console.log('   ✓ SUCCESS with YTDlpModule.YTDlpWrap');
        return;
    } catch (e) {
        console.log('   ✗ Failed:', e.message);
    }
    
    console.log('\n=== END INSPECTION ===');
}

inspect().catch(console.error);
