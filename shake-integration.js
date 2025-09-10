/** =========================
 *  Shake Integration - Ensures everything connects properly
 *  ========================= */

// Wait for all modules to load, then integrate shake system
document.addEventListener('DOMContentLoaded', function() {
    // Small delay to ensure all scripts are loaded
    setTimeout(function() {
        initializeShakeSystem();
    }, 100);
});

function initializeShakeSystem() {
    // Ensure Game.VisualEffects exists
    if (!Game.VisualEffects) {
        console.error('Game.VisualEffects not loaded!');
        return;
    }

    // Ensure Game.Renderer exists
    if (!Game.Renderer) {
        console.error('Game.Renderer not loaded!');
        return;
    }

    // Make sure the shake system is properly connected
    if (!Game.VFX) {
        console.error('Game.VFX not loaded!');
        return;
    }

    console.log('Shake system initialized successfully!');
    
    // Start the visual effects system
    Game.VisualEffects.start();
    
    console.log('You can test the shake system by typing: testShakeSystem()');
}