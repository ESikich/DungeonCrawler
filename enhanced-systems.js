/** =========================
 *  Enhanced Systems - Complete Combat & Progression with Visual Effects
 *  ========================= */

// Enhanced Combat System
Game.Systems.Combat.handleAttack = function(attackerId, targetId) {
    const as = Game.ECS.getComponent(attackerId, 'stats');
    const th = Game.ECS.getComponent(targetId, 'health');
    const td = Game.ECS.getComponent(targetId, 'descriptor');
    const ad = Game.ECS.getComponent(attackerId, 'descriptor');
    const tpos = Game.ECS.getComponent(targetId, 'position');
    
    if (!as || !th || !tpos) return;

    const dmg = randInt(3, 8) + Math.floor(as.strength / 3);
    
    // Determine if critical hit (10% chance)
    const isCritical = Math.random() < 0.1;
    const finalDamage = isCritical ? Math.floor(dmg * 1.5) : dmg;
    
    th.hp -= finalDamage;

    // Visual Effects for damage
    if (isCritical) {
        Game.VFX.critical(tpos.x, tpos.y, finalDamage);
        Game.VFX.shake(6, 200);
    } else {
        Game.VFX.damage(tpos.x, tpos.y, finalDamage);
        Game.VFX.shake(3, 150);
    }

    // Track stats
    if (attackerId === Game.world.playerEid) {
        Game.state.playerAttackedThisTurn = true;
        Game.stats.totalDamageDealt += finalDamage;
        Game.stats.timesAttacked++;
    } else if (targetId === Game.world.playerEid) {
        Game.stats.totalDamageTaken += finalDamage;
    }

    const targetName = td ? td.name : 'enemy';
    const attackerName = ad ? ad.name : 'attacker';
    const critText = isCritical ? ' CRITICAL!' : '';
    addMessage(`Dealt ${finalDamage} damage to ${targetName}!${critText}`);

    if (th.hp <= 0) {
        addMessage(targetName + ' defeated!');
        
        if (targetId === Game.world.playerEid) {
            Game.stats.deathCause = 'Combat';
            Game.stats.killedBy = attackerName;
            Game.stats.endTime = Date.now();
            Game.state.gameOver = true;
            Game.state.current = 'gameOver';
            addMessage('You have died! Press R to restart.');
            
            Game.VFX.shake(12, 800);
        } else {
            this.onKill(targetId, attackerId);
        }
    }
};

Game.Systems.Combat.onKill = function(victimId, killerId) {
    const vpos = Game.ECS.getComponent(victimId, 'position');
    
    dropLoot(victimId);
    
    if (killerId !== Game.world.playerEid) { 
        Game.ECS.destroyEntity(victimId); 
        return; 
    }
    
    Game.stats.enemiesKilled++;
    
    const xv = Game.ECS.getComponent(victimId, 'xpValue');
    if (xv && typeof xv.xp === 'number') { 
        if (vpos) {
            Game.VFX.xp(vpos.x, vpos.y, xv.xp);
        }
        Game.Systems.Progression.gainXP(xv.xp); 
    }
    Game.ECS.destroyEntity(victimId);
};

// Enhanced Progression System
Game.Systems.Progression.gainXP = function(amount) {
    const prog = Game.ECS.getComponent(Game.world.playerEid, 'progress');
    const ppos = Game.ECS.getComponent(Game.world.playerEid, 'position');
    
    if (!prog) return;
    
    prog.xp += Math.max(0, amount | 0);
    Game.stats.totalXpGained += Math.max(0, amount | 0);
    addMessage('Gained ' + amount + ' XP.');
    
    while (prog.xp >= prog.next) {
        prog.xp -= prog.next;
        prog.level += 1;
        prog.next = Math.floor(prog.next * 1.5) + 10;

        const hp = Game.ECS.getComponent(Game.world.playerEid, 'health');
        const st = Game.ECS.getComponent(Game.world.playerEid, 'stats');
        
        if (hp) { 
            const oldHp = hp.hp;
            hp.maxHp += 10; 
            hp.hp = hp.maxHp;
            
            if (ppos) {
                Game.VFX.heal(ppos.x, ppos.y, hp.hp - oldHp);
            }
        }
        
        if (st) { 
            st.strength += 1; 
            st.accuracy += 1; 
            if (prog.level % 2 === 0) st.agility += 1; 
        }
        
        addMessage('You are now level ' + prog.level + '! (+stats, HP restored)');
        Game.stats.highestLevel = Math.max(Game.stats.highestLevel, prog.level);
        
        Game.VFX.shake(4, 300);
        if (ppos) {
            Game.VFX.pulse(Game.world.playerEid, 'gold', 0.05, 0.6);
            setTimeout(() => Game.VFX.stopPulse(Game.world.playerEid), 2000);
        }
    }
};

// Enhanced Turn Processor
Game.Systems.TurnProcessor.process = function() {
    Game.state.playerAttackedThisTurn = false;

    // Visual effects update themselves automatically at 60fps
    // No need to call update here

    Game.Systems.Movement.process();
    
    const st = Game.ECS.getComponent(Game.world.playerEid, 'status');
    const hasSpeedBoost = st && st.speedBoost > 0;
    
    if (!Game.state.speedActionCount) {
        Game.state.speedActionCount = 0;
    }
    
    if (hasSpeedBoost) {
        Game.state.speedActionCount++;
        
        const seers = Game.ECS.getEntitiesWith(['vision', 'position']);
        for (let i = 0; i < seers.length; i++) {
            Game.Systems.Vision.update(seers[i]);
        }
        
        if (Game.state.speedActionCount >= 2) {
            Game.state.speedActionCount = 0;
            
            processMonsterAI();
            Game.Systems.Movement.process();
            
            for (let i = 0; i < seers.length; i++) {
                Game.Systems.Vision.update(seers[i]);
            }
            
            if (!Game.state.playerAttackedThisTurn && !Game.state.justDescended) {
                Game.Systems.Combat.processEnemyAttacks();
            }
            
            Game.Systems.StatusEffects.update();
            Game.state.justDescended = false;
            Game.state.turnCount++;
            
            return false;
        } else {
            return true;
        }
    } else {
        Game.state.speedActionCount = 0;
        
        processMonsterAI();
        Game.Systems.Movement.process();

        const seers = Game.ECS.getEntitiesWith(['vision', 'position']);
        for (let i = 0; i < seers.length; i++) {
            Game.Systems.Vision.update(seers[i]);
        }

        if (!Game.state.playerAttackedThisTurn && !Game.state.justDescended) {
            Game.Systems.Combat.processEnemyAttacks();
        }

        Game.Systems.StatusEffects.update();
        Game.state.justDescended = false;
        Game.state.turnCount++;
        
        return false;
    }
};