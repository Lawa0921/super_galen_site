// WebGL 地圖遊戲引擎
class WebGLMapGame {
    constructor(canvasId, minimapId) {
        this.canvas = document.getElementById(canvasId);
        this.minimap = document.getElementById(minimapId);
        this.gl = this.canvas.getContext('webgl');

        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }

        // 遊戲狀態
        this.gameState = {
            player: {
                x: 0,
                z: 0,
                rotation: 0,
                speed: 0.1,
                level: 32, // 從主介面同步等級
                hp: 1000,
                maxHp: 1000,
                mp: 500,
                maxMp: 500,
                sp: 300,
                maxSp: 300,
                exp: 0,
                expToNext: 100,
                companions: []
            },
            camera: {
                x: 0,
                z: 8,
                y: 6,
                rotation: { x: -0.3, y: 0 },
                isDragging: false,
                lastMouse: { x: 0, y: 0 }
            },
            world: {
                size: 20,
                scale: 1
            },
            gameState: {
                canMove: true,
                inBattle: false,
                inEncounter: false
            },
            encounterZones: [
                // 草叢區域
                { type: 'grass', x: -3, z: 2, radius: 2, icon: '🌿', companions: ['common'] },
                { type: 'grass', x: 5, z: -1, radius: 2, icon: '🌿', companions: ['common'] },
                { type: 'grass', x: -1, z: 6, radius: 2, icon: '🌿', companions: ['common', 'rare'] },

                // 森林區域
                { type: 'forest', x: -7, z: -1, radius: 2.5, icon: '🌲', companions: ['rare'] },
                { type: 'forest', x: 3, z: 5, radius: 2.5, icon: '🌲', companions: ['rare', 'epic'] },

                // 洞窟區域
                { type: 'cave', x: 6, z: -5, radius: 2, icon: '🕳️', companions: ['epic'] },
                { type: 'cave', x: -5, z: 7, radius: 2, icon: '🕳️', companions: ['epic', 'legendary'] },

                // 水域
                { type: 'water', x: 2, z: -4, radius: 3, icon: '🌊', companions: ['common', 'rare'] },
                { type: 'water', x: -4, z: -6, radius: 2.5, icon: '🌊', companions: ['rare'] }
            ],
            discoveries: new Set(),
            locations: [
                { x: 0, z: 0, icon: '🏠', name: '台灣老家', desc: '冒險的起點', discovered: false, npc: { name: '家人', avatar: '👨‍👩‍👧‍👦', message: '歡迎回家！準備好開始你的冒險了嗎？' } },
                { x: -6, z: -3, icon: '💻', name: '程式聖殿', desc: '程式碼的神聖之地', discovered: false, npc: { name: '程式大師', avatar: '👨‍💻', message: '想學習更高深的程式技術嗎？' } },
                { x: 4, z: -7, icon: '🏔️', name: '技術高峰', desc: '挑戰極限的地方', discovered: false, npc: { name: '修練者', avatar: '🧙‍♂️', message: '只有最強的開發者才能到達這裡！' } },
                { x: -8, z: 5, icon: '🎲', name: '桌遊樂園', desc: '歡樂的遊戲世界', discovered: false, npc: { name: '遊戲設計師', avatar: '🎯', message: '要不要一起設計新遊戲？' } },
                { x: 7, z: 3, icon: '🏕️', name: '野外營地', desc: '自然與冒險', discovered: false, npc: { name: '探險家', avatar: '🏕️', message: '野外生存的秘訣就是保持冷靜！' } },
                { x: -2, z: -8, icon: '☕', name: '咖啡聖地', desc: '靈感的源泉', discovered: false, npc: { name: '咖啡大師', avatar: '☕', message: '需要一杯完美的咖啡來提神嗎？' } },
                { x: 9, z: -2, icon: '🌸', name: '櫻花秘境', desc: '美麗的隱秘花園', discovered: false, npc: { name: '花仙子', avatar: '🌸', message: '這裡的櫻花一年四季都會盛開哦！' } },
                { x: 0, z: -9, icon: '🎯', name: '終極目標', desc: '夢想的終點', discovered: false, npc: { name: '智者', avatar: '👴', message: '恭喜你走到了這裡，這只是新的開始！' } }
            ],
            companions: {
                available: [
                    { id: 1, name: 'Code Cat', sprite: '🐱', skill: '除錯專家', level: 1, hp: 80, maxHp: 80, type: '程式系', rarity: 'common' },
                    { id: 2, name: 'Debug Duck', sprite: '🦆', skill: '橡皮鴨除錯法', level: 1, hp: 70, maxHp: 70, type: '輔助系', rarity: 'common' },
                    { id: 3, name: 'Commit Dog', sprite: '🐕', skill: 'Git 大師', level: 2, hp: 90, maxHp: 90, type: '版控系', rarity: 'rare' },
                    { id: 4, name: 'Deploy Dragon', sprite: '🐉', skill: 'CI/CD 專家', level: 3, hp: 120, maxHp: 120, type: '部署系', rarity: 'epic' },
                    { id: 5, name: 'Test Tiger', sprite: '🐅', skill: '測試覆蓋專家', level: 2, hp: 100, maxHp: 100, type: '測試系', rarity: 'rare' },
                    { id: 6, name: 'Security Shark', sprite: '🦈', skill: '安全防護', level: 4, hp: 150, maxHp: 150, type: '安全系', rarity: 'legendary' }
                ]
            },
            currentEncounter: null,
            currentBattle: null,
            currentNpc: null,
            stepCount: 0,
            encounterChance: 0.05 // 5% 遇敵機率
        };

        // 著色器程式
        this.shaderProgram = null;
        this.buffers = {};

        // 輸入控制
        this.keys = {};

        this.init();
    }

    init() {
        // 從主介面同步玩家狀態
        this.syncWithMainGameState();
        this.setupWebGL();
        this.setupShaders();
        this.setupBuffers();
        this.setupEventListeners();
        this.gameLoop();
        this.updateLocationList();
    }

    // 從主介面同步遊戲狀態
    syncWithMainGameState() {
        if (window.GameState) {
            const mainState = window.GameState.getState();

            // 同步 HP/MP/SP 數據
            this.gameState.player.hp = mainState.hp;
            this.gameState.player.maxHp = 1000; // 從 gamestate.js 設定檔讀取
            this.gameState.player.mp = mainState.mp;
            this.gameState.player.maxMp = 500;
            this.gameState.player.sp = mainState.sp;
            this.gameState.player.maxSp = 300;

            // 計算等級（基於現有的數值範圍推算）
            // HP 1000 對應等級 32，假設每級增加約 31.25 HP
            this.gameState.player.level = Math.max(1, Math.floor(mainState.hp / 31.25));

            console.log('地圖遊戲已同步主介面狀態:', {
                hp: `${this.gameState.player.hp}/${this.gameState.player.maxHp}`,
                mp: `${this.gameState.player.mp}/${this.gameState.player.maxMp}`,
                sp: `${this.gameState.player.sp}/${this.gameState.player.maxSp}`,
                level: this.gameState.player.level
            });
        } else {
            console.warn('主介面遊戲狀態系統尚未載入，使用預設值');
        }
    }

    setupWebGL() {
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    }

    setupShaders() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec3 aColor;

            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;

            varying vec3 vColor;

            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                vColor = aColor;
            }
        `;

        const fragmentShaderSource = `
            precision mediump float;
            varying vec3 vColor;

            void main() {
                gl_FragColor = vec4(vColor, 1.0);
            }
        `;

        const vertexShader = this.compileShader(vertexShaderSource, this.gl.VERTEX_SHADER);
        const fragmentShader = this.compileShader(fragmentShaderSource, this.gl.FRAGMENT_SHADER);

        this.shaderProgram = this.gl.createProgram();
        this.gl.attachShader(this.shaderProgram, vertexShader);
        this.gl.attachShader(this.shaderProgram, fragmentShader);
        this.gl.linkProgram(this.shaderProgram);

        if (!this.gl.getProgramParameter(this.shaderProgram, this.gl.LINK_STATUS)) {
            console.error('Shader program failed to link');
        }

        // 獲取屬性和uniform位置
        this.shaderProgram.attribLocations = {
            position: this.gl.getAttribLocation(this.shaderProgram, 'aPosition'),
            color: this.gl.getAttribLocation(this.shaderProgram, 'aColor')
        };

        this.shaderProgram.uniformLocations = {
            projectionMatrix: this.gl.getUniformLocation(this.shaderProgram, 'uProjectionMatrix'),
            modelViewMatrix: this.gl.getUniformLocation(this.shaderProgram, 'uModelViewMatrix')
        };
    }

    compileShader(source, type) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', this.gl.getShaderInfoLog(shader));
        }

        return shader;
    }

    setupBuffers() {
        // 地形網格
        const terrainVertices = [];
        const terrainColors = [];
        const size = this.gameState.world.size;

        for (let x = -size; x <= size; x += 2) {
            for (let z = -size; z <= size; z += 2) {
                // 創建地面瓷磚
                const height = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 0.2;

                terrainVertices.push(
                    x, height, z,
                    x + 2, height, z,
                    x, height, z + 2,
                    x + 2, height, z + 2
                );

                // 地面顏色變化
                const green = 0.2 + Math.random() * 0.2;
                const blue = 0.1 + Math.random() * 0.1;

                for (let i = 0; i < 4; i++) {
                    terrainColors.push(0.1, green, blue);
                }
            }
        }

        // 玩家
        const playerVertices = [
            0, 0.2, 0,
            -0.2, 0, 0.2,
            0.2, 0, 0.2,
            0, 0, -0.3
        ];

        const playerColors = [
            1, 1, 0, // 黃色
            1, 0.5, 0, // 橘色
            1, 0.5, 0, // 橘色
            1, 0, 0 // 紅色
        ];

        // 位置點標記
        const locationVertices = [];
        const locationColors = [];

        this.gameState.locations.forEach(location => {
            const x = location.x;
            const z = location.z;

            // 創建標記柱
            locationVertices.push(
                x, 0, z,
                x, 1, z
            );

            // 金色標記
            locationColors.push(
                1, 0.84, 0,
                1, 1, 0.5
            );
        });

        // 遭遇區域標記
        const zoneVertices = [];
        const zoneColors = [];

        this.gameState.encounterZones.forEach(zone => {
            const x = zone.x;
            const z = zone.z;
            const r = zone.radius;

            // 創建區域邊界圓圈
            for (let i = 0; i < 16; i++) {
                const angle = (i / 16) * Math.PI * 2;
                const nextAngle = ((i + 1) / 16) * Math.PI * 2;

                zoneVertices.push(
                    x + Math.cos(angle) * r, 0.05, z + Math.sin(angle) * r,
                    x + Math.cos(nextAngle) * r, 0.05, z + Math.sin(nextAngle) * r
                );

                // 根據區域類型設置顏色
                let color = [0.2, 0.8, 0.2]; // 默認草叢綠色

                switch (zone.type) {
                    case 'grass':
                        color = [0.2, 0.8, 0.2]; // 綠色
                        break;
                    case 'forest':
                        color = [0.1, 0.6, 0.1]; // 深綠色
                        break;
                    case 'cave':
                        color = [0.5, 0.3, 0.1]; // 棕色
                        break;
                    case 'water':
                        color = [0.1, 0.3, 0.8]; // 藍色
                        break;
                }

                for (let j = 0; j < 2; j++) {
                    zoneColors.push(...color);
                }
            }
        });

        // 創建緩衝區
        this.buffers = {
            terrain: {
                position: this.createBuffer(terrainVertices),
                color: this.createBuffer(terrainColors)
            },
            player: {
                position: this.createBuffer(playerVertices),
                color: this.createBuffer(playerColors)
            },
            locations: {
                position: this.createBuffer(locationVertices),
                color: this.createBuffer(locationColors)
            },
            zones: {
                position: this.createBuffer(zoneVertices),
                color: this.createBuffer(zoneColors)
            }
        };
    }

    createBuffer(data) {
        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(data), this.gl.STATIC_DRAW);
        return buffer;
    }

    setupEventListeners() {
        // 鍵盤控制
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            // 空格鍵互動
            if (e.code === 'Space') {
                e.preventDefault();
                this.handleInteraction();
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // 滑鼠控制相機
        this.canvas.addEventListener('mousedown', (e) => {
            this.gameState.camera.isDragging = true;
            this.gameState.camera.lastMouse = { x: e.clientX, y: e.clientY };
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.gameState.camera.isDragging) return;

            const deltaX = e.clientX - this.gameState.camera.lastMouse.x;
            const deltaY = e.clientY - this.gameState.camera.lastMouse.y;

            this.gameState.camera.rotation.y += deltaX * 0.01;
            this.gameState.camera.rotation.x += deltaY * 0.01;

            // 限制垂直旋轉
            this.gameState.camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.gameState.camera.rotation.x));

            this.gameState.camera.lastMouse = { x: e.clientX, y: e.clientY };
        });

        document.addEventListener('mouseup', () => {
            this.gameState.camera.isDragging = false;
        });

        // 滾輪控制縮放
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.gameState.camera.z += e.deltaY * 0.01;
            this.gameState.camera.z = Math.max(2, Math.min(15, this.gameState.camera.z));
        });

        // 關閉發現面板
        document.getElementById('close-discovery').addEventListener('click', () => {
            document.getElementById('discovery-panel').style.display = 'none';
        });

        // RPG 事件監聽器
        this.setupRPGEventListeners();
    }

    updatePlayer() {
        // 如果無法移動（戰鬥中或遭遇中），直接返回
        if (!this.gameState.gameState.canMove) {
            return;
        }

        const player = this.gameState.player;
        let moved = false;

        // WASD 或方向鍵移動
        if (this.keys['KeyW'] || this.keys['ArrowUp']) {
            player.z -= player.speed;
            moved = true;
        }
        if (this.keys['KeyS'] || this.keys['ArrowDown']) {
            player.z += player.speed;
            moved = true;
        }
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
            player.x -= player.speed;
            moved = true;
        }
        if (this.keys['KeyD'] || this.keys['ArrowRight']) {
            player.x += player.speed;
            moved = true;
        }

        // 邊界檢查
        const limit = this.gameState.world.size - 1;
        player.x = Math.max(-limit, Math.min(limit, player.x));
        player.z = Math.max(-limit, Math.min(limit, player.z));

        if (moved) {
            this.updateCameraPosition();
            this.updateUI();
            this.checkDiscoveries();
            this.checkEncounterZones();
        }
    }

    updateCameraPosition() {
        const player = this.gameState.player;
        const camera = this.gameState.camera;

        // 跟隨玩家
        camera.x = player.x;
    }

    updateUI() {
        const player = this.gameState.player;
        const position = document.getElementById('player-position');
        const discoveries = document.getElementById('discoveries-count');

        if (position) {
            position.textContent = `位置: (${Math.round(player.x)}, ${Math.round(player.z)})`;
        }

        if (discoveries) {
            const discoveredCount = this.gameState.discoveries.size;
            discoveries.textContent = `發現: ${discoveredCount}/${this.gameState.locations.length}`;
        }

        // 更新夥伴和等級信息
        const companionCount = document.getElementById('companion-count');
        const playerLevel = document.getElementById('player-level');

        if (companionCount) {
            companionCount.textContent = `夥伴: ${this.gameState.player.companions.length}/6`;
        }

        if (playerLevel) {
            playerLevel.textContent = `等級: ${this.gameState.player.level}`;
        }
    }

    checkDiscoveries() {
        const player = this.gameState.player;

        this.gameState.locations.forEach((location, index) => {
            const distance = Math.sqrt(
                Math.pow(player.x - location.x, 2) +
                Math.pow(player.z - location.z, 2)
            );

            if (distance < 1.5 && !this.gameState.discoveries.has(index)) {
                this.discoverLocation(index, location);
            }
        });
    }

    discoverLocation(index, location) {
        this.gameState.discoveries.add(index);
        location.discovered = true;

        // 顯示發現面板
        const panel = document.getElementById('discovery-panel');
        const title = document.getElementById('discovery-title');
        const description = document.getElementById('discovery-description');
        const icon = panel.querySelector('.discovery-icon');

        if (panel && title && description && icon) {
            icon.textContent = location.icon;
            title.textContent = location.name;
            description.textContent = location.desc;
            panel.style.display = 'block';
        }

        // 更新位置列表
        this.updateLocationList();

        // 如果發現所有位置，觸發特殊事件
        if (this.gameState.discoveries.size === this.gameState.locations.length) {
            setTimeout(() => this.onAllLocationsDiscovered(), 2000);
        }
    }

    onAllLocationsDiscovered() {
        const panel = document.getElementById('discovery-panel');
        const title = document.getElementById('discovery-title');
        const description = document.getElementById('discovery-description');
        const icon = panel.querySelector('.discovery-icon');

        if (panel && title && description && icon) {
            icon.textContent = '🎉';
            title.textContent = '完美探索者！';
            description.textContent = '恭喜你發現了所有隱藏地點！你是真正的探索大師！';
            panel.style.display = 'block';
        }
    }

    updateLocationList() {
        const grid = document.getElementById('locations-grid');
        if (!grid) return;

        const locationItems = grid.querySelectorAll('.location-item');

        this.gameState.locations.forEach((location, index) => {
            const item = locationItems[index];
            if (item) {
                if (location.discovered) {
                    item.classList.remove('locked');
                    item.classList.add('discovered');
                }
            }
        });
    }

    drawMinimap() {
        const ctx = this.minimap.getContext('2d');
        const width = this.minimap.width;
        const height = this.minimap.height;
        const scale = width / (this.gameState.world.size * 2);

        // 清空小地圖
        ctx.fillStyle = 'rgba(0, 20, 40, 0.8)';
        ctx.fillRect(0, 0, width, height);

        // 繪製網格
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 10; i++) {
            const pos = (i / 10) * width;
            ctx.beginPath();
            ctx.moveTo(pos, 0);
            ctx.lineTo(pos, height);
            ctx.moveTo(0, pos);
            ctx.lineTo(width, pos);
            ctx.stroke();
        }

        // 繪製遭遇區域
        this.gameState.encounterZones.forEach(zone => {
            const x = (zone.x + this.gameState.world.size) * scale;
            const z = (zone.z + this.gameState.world.size) * scale;
            const r = zone.radius * scale;

            ctx.beginPath();
            ctx.arc(x, z, r, 0, 2 * Math.PI);

            let color;
            switch (zone.type) {
                case 'grass':
                    color = 'rgba(34, 197, 94, 0.3)';
                    break;
                case 'forest':
                    color = 'rgba(21, 128, 61, 0.3)';
                    break;
                case 'cave':
                    color = 'rgba(120, 53, 15, 0.3)';
                    break;
                case 'water':
                    color = 'rgba(59, 130, 246, 0.3)';
                    break;
            }

            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = color.replace('0.3', '0.8');
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        // 繪製位置點
        this.gameState.locations.forEach((location, index) => {
            const x = (location.x + this.gameState.world.size) * scale;
            const z = (location.z + this.gameState.world.size) * scale;

            ctx.beginPath();
            ctx.arc(x, z, 4, 0, 2 * Math.PI);

            if (location.discovered) {
                ctx.fillStyle = '#4ade80';
            } else {
                ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
            }
            ctx.fill();
        });

        // 繪製玩家位置
        const playerX = (this.gameState.player.x + this.gameState.world.size) * scale;
        const playerZ = (this.gameState.player.z + this.gameState.world.size) * scale;

        ctx.beginPath();
        ctx.arc(playerX, playerZ, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff6b6b';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    render() {
        this.gl.clearColor(0.05, 0.05, 0.15, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        this.gl.useProgram(this.shaderProgram);

        // 設置投影矩陣
        const projectionMatrix = this.createPerspectiveMatrix(
            45 * Math.PI / 180, // fov
            this.canvas.width / this.canvas.height, // aspect
            0.1, // near
            100.0 // far
        );

        // 設置視圖矩陣
        const modelViewMatrix = this.createViewMatrix();

        this.gl.uniformMatrix4fv(this.shaderProgram.uniformLocations.projectionMatrix, false, projectionMatrix);
        this.gl.uniformMatrix4fv(this.shaderProgram.uniformLocations.modelViewMatrix, false, modelViewMatrix);

        // 繪製地形
        this.drawBuffer(this.buffers.terrain, this.gl.TRIANGLE_STRIP);

        // 繪製遭遇區域
        this.drawBuffer(this.buffers.zones, this.gl.LINES);

        // 繪製位置標記
        this.drawBuffer(this.buffers.locations, this.gl.LINES);

        // 繪製玩家
        this.drawPlayerAtPosition();

        // 繪製小地圖
        this.drawMinimap();
    }

    drawBuffer(buffer, mode) {
        // 位置
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer.position);
        this.gl.vertexAttribPointer(this.shaderProgram.attribLocations.position, 3, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.shaderProgram.attribLocations.position);

        // 顏色
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer.color);
        this.gl.vertexAttribPointer(this.shaderProgram.attribLocations.color, 3, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.shaderProgram.attribLocations.color);

        const vertexCount = buffer.position.itemCount || (buffer.color.itemCount || 4);
        this.gl.drawArrays(mode, 0, vertexCount);
    }

    drawPlayerAtPosition() {
        const player = this.gameState.player;

        // 創建玩家變換矩陣
        const playerMatrix = this.createTranslationMatrix(player.x, 0, player.z);
        const combinedMatrix = this.multiplyMatrices(this.createViewMatrix(), playerMatrix);

        this.gl.uniformMatrix4fv(this.shaderProgram.uniformLocations.modelViewMatrix, false, combinedMatrix);
        this.drawBuffer(this.buffers.player, this.gl.TRIANGLES);

        // 恢復原始視圖矩陣
        this.gl.uniformMatrix4fv(this.shaderProgram.uniformLocations.modelViewMatrix, false, this.createViewMatrix());
    }

    createPerspectiveMatrix(fov, aspect, near, far) {
        const f = 1.0 / Math.tan(fov / 2);
        const rangeInv = 1 / (near - far);

        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (near + far) * rangeInv, -1,
            0, 0, near * far * rangeInv * 2, 0
        ]);
    }

    createViewMatrix() {
        const camera = this.gameState.camera;

        // 基本平移
        const translation = this.createTranslationMatrix(-camera.x, -camera.y, -camera.z);

        // X軸旋轉（俯視角）
        const rotX = this.createRotationXMatrix(camera.rotation.x);

        // Y軸旋轉（水平旋轉）
        const rotY = this.createRotationYMatrix(camera.rotation.y);

        // 組合變換
        let result = this.multiplyMatrices(rotX, translation);
        result = this.multiplyMatrices(rotY, result);

        return result;
    }

    createTranslationMatrix(x, y, z) {
        return new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            x, y, z, 1
        ]);
    }

    createRotationXMatrix(angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return new Float32Array([
            1, 0, 0, 0,
            0, c, s, 0,
            0, -s, c, 0,
            0, 0, 0, 1
        ]);
    }

    createRotationYMatrix(angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return new Float32Array([
            c, 0, -s, 0,
            0, 1, 0, 0,
            s, 0, c, 0,
            0, 0, 0, 1
        ]);
    }

    multiplyMatrices(a, b) {
        const result = new Float32Array(16);

        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                result[i * 4 + j] = 0;
                for (let k = 0; k < 4; k++) {
                    result[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
                }
            }
        }

        return result;
    }

    // ========== RPG 系統方法 ==========

    setupRPGEventListeners() {
        // 遭遇面板事件
        document.getElementById('battle-btn').addEventListener('click', () => {
            this.startBattle();
        });

        document.getElementById('capture-btn').addEventListener('click', () => {
            this.attemptCapture();
        });

        document.getElementById('flee-btn').addEventListener('click', () => {
            this.hidePanel('encounter-panel');
            this.unlockMovement();
        });

        // 戰鬥面板事件
        document.getElementById('attack-btn').addEventListener('click', () => {
            this.playerAttack();
        });

        document.getElementById('defend-btn').addEventListener('click', () => {
            this.playerDefend();
        });

        document.getElementById('special-btn').addEventListener('click', () => {
            this.playerSpecial();
        });

        document.getElementById('escape-btn').addEventListener('click', () => {
            this.escapeBattle();
        });

        // NPC 對話事件
        document.getElementById('close-npc').addEventListener('click', () => {
            this.hidePanel('npc-panel');
        });
    }

    handleInteraction() {
        const player = this.gameState.player;

        // 檢查是否在已發現的地點附近
        this.gameState.locations.forEach(location => {
            if (!location.discovered) return;

            const distance = Math.sqrt(
                Math.pow(player.x - location.x, 2) +
                Math.pow(player.z - location.z, 2)
            );

            if (distance < 2) {
                this.showNPCDialogue(location);
            }
        });
    }

    checkEncounterZones() {
        const player = this.gameState.player;

        // 檢查是否在任何遭遇區域內
        this.gameState.encounterZones.forEach(zone => {
            const distance = Math.sqrt(
                Math.pow(player.x - zone.x, 2) +
                Math.pow(player.z - zone.z, 2)
            );

            if (distance < zone.radius) {
                // 在遭遇區域內，隨機觸發遭遇
                if (Math.random() < this.getEncounterRate(zone.type)) {
                    this.triggerZoneEncounter(zone);
                }
            }
        });
    }

    getEncounterRate(zoneType) {
        const rates = {
            'grass': 0.03,    // 草叢3%
            'forest': 0.05,   // 森林5%
            'cave': 0.08,     // 洞窟8%
            'water': 0.04     // 水域4%
        };
        return rates[zoneType] || 0.03;
    }

    triggerZoneEncounter(zone) {
        // 鎖定移動
        this.gameState.gameState.canMove = false;
        this.gameState.gameState.inEncounter = true;

        // 根據區域類型篩選可出現的夥伴
        const zoneCompanions = this.gameState.companions.available.filter(companion =>
            zone.companions.includes(companion.rarity)
        );

        if (zoneCompanions.length === 0) return;

        const randomCompanion = zoneCompanions[Math.floor(Math.random() * zoneCompanions.length)];

        // 創建野生版本
        const wildCompanion = {
            ...randomCompanion,
            level: Math.max(1, this.gameState.player.level + Math.floor(Math.random() * 3) - 1),
            hp: randomCompanion.maxHp,
            isWild: true,
            zone: zone.type
        };

        this.gameState.currentEncounter = wildCompanion;
        this.showEncounterPanel(wildCompanion, zone);
    }

    showEncounterPanel(companion, zone) {
        const panel = document.getElementById('encounter-panel');
        const sprite = document.querySelector('#encounter-companion .companion-sprite');
        const name = document.getElementById('encounter-name');
        const level = document.getElementById('encounter-level');
        const skill = document.getElementById('encounter-skill');
        const header = panel.querySelector('.encounter-header h4');

        sprite.textContent = companion.sprite;
        name.textContent = companion.name;
        level.textContent = companion.level;
        skill.textContent = companion.skill;

        // 根據區域類型更新標題
        const zoneNames = {
            'grass': '草叢',
            'forest': '森林',
            'cave': '洞窟',
            'water': '水域'
        };

        const zoneName = zoneNames[zone.type] || '神秘區域';
        header.textContent = `野生的夥伴從${zoneName}中出現了！${zone.icon}`;

        panel.style.display = 'block';
    }

    startBattle() {
        this.hidePanel('encounter-panel');

        // 進入戰鬥狀態
        this.gameState.gameState.inBattle = true;
        this.gameState.gameState.inEncounter = false;

        this.gameState.currentBattle = {
            enemy: { ...this.gameState.currentEncounter },
            player: {
                hp: this.gameState.player.hp,
                maxHp: this.gameState.player.maxHp,
                mp: this.gameState.player.mp,
                maxMp: this.gameState.player.maxMp,
                sp: this.gameState.player.sp,
                maxSp: this.gameState.player.maxSp,
                level: this.gameState.player.level
            },
            turn: 'player',
            log: []
        };

        this.showBattlePanel();
    }

    showBattlePanel() {
        const panel = document.getElementById('battle-panel');
        const enemySprite = document.getElementById('enemy-sprite');
        const enemyName = document.getElementById('enemy-name');
        const playerLevel = document.getElementById('battle-player-level');
        const log = document.getElementById('battle-log');

        const battle = this.gameState.currentBattle;

        enemySprite.textContent = battle.enemy.sprite;
        enemyName.textContent = battle.enemy.name;
        playerLevel.textContent = battle.player.level;

        this.updateBattleHP();

        log.innerHTML = '<p>戰鬥開始！</p>';
        panel.style.display = 'block';
    }

    updateBattleHP() {
        const battle = this.gameState.currentBattle;

        // 更新敵人血量
        const enemyHP = document.getElementById('enemy-hp');
        const enemyHPText = document.getElementById('enemy-hp-text');
        const enemyPercent = (battle.enemy.hp / battle.enemy.maxHp) * 100;
        enemyHP.style.width = `${enemyPercent}%`;
        enemyHPText.textContent = `${battle.enemy.hp}/${battle.enemy.maxHp}`;

        // 更新玩家血量
        const playerHP = document.getElementById('player-hp');
        const playerHPText = document.getElementById('player-hp-text');
        const playerPercent = (battle.player.hp / battle.player.maxHp) * 100;
        playerHP.style.width = `${playerPercent}%`;
        playerHPText.textContent = `${battle.player.hp}/${battle.player.maxHp}`;

        // 更新玩家 MP 和 SP（如果元素存在）
        const playerMP = document.getElementById('player-mp');
        const playerMPText = document.getElementById('player-mp-text');
        if (playerMP && playerMPText) {
            const mpPercent = (battle.player.mp / battle.player.maxMp) * 100;
            playerMP.style.width = `${mpPercent}%`;
            playerMPText.textContent = `${battle.player.mp}/${battle.player.maxMp}`;
        }

        const playerSP = document.getElementById('player-sp');
        const playerSPText = document.getElementById('player-sp-text');
        if (playerSP && playerSPText) {
            const spPercent = (battle.player.sp / battle.player.maxSp) * 100;
            playerSP.style.width = `${spPercent}%`;
            playerSPText.textContent = `${battle.player.sp}/${battle.player.maxSp}`;
        }
    }

    playerAttack() {
        if (this.gameState.currentBattle.turn !== 'player') return;

        const damage = Math.floor(Math.random() * 20) + 10 + this.gameState.player.level * 2;
        this.gameState.currentBattle.enemy.hp -= damage;

        this.addBattleLog(`你對 ${this.gameState.currentBattle.enemy.name} 造成了 ${damage} 點傷害！`);

        if (this.gameState.currentBattle.enemy.hp <= 0) {
            this.gameState.currentBattle.enemy.hp = 0;
            this.updateBattleHP();
            this.winBattle();
            return;
        }

        this.updateBattleHP();
        this.gameState.currentBattle.turn = 'enemy';
        setTimeout(() => this.enemyTurn(), 1000);
    }

    playerDefend() {
        if (this.gameState.currentBattle.turn !== 'player') return;

        // 檢查是否有足夠 SP
        const spCost = 10;
        if (this.gameState.currentBattle.player.sp < spCost) {
            this.addBattleLog('SP 不足，無法使用防禦！');
            return;
        }

        // 消耗 SP
        this.gameState.currentBattle.player.sp -= spCost;
        this.gameState.player.sp = this.gameState.currentBattle.player.sp;

        // 同步到主介面
        if (window.GameState) {
            window.GameState.setSP(this.gameState.player.sp);
        }

        this.addBattleLog(`你採取了防禦姿態（消耗 ${spCost} SP）！`);
        this.gameState.currentBattle.defending = true;
        this.gameState.currentBattle.turn = 'enemy';
        setTimeout(() => this.enemyTurn(), 1000);
    }

    playerSpecial() {
        if (this.gameState.currentBattle.turn !== 'player') return;

        // 檢查是否有足夠 MP
        const mpCost = 20;
        if (this.gameState.currentBattle.player.mp < mpCost) {
            this.addBattleLog('MP 不足，無法使用特殊攻擊！');
            return;
        }

        // 消耗 MP
        this.gameState.currentBattle.player.mp -= mpCost;
        this.gameState.player.mp = this.gameState.currentBattle.player.mp;

        // 同步到主介面
        if (window.GameState) {
            window.GameState.setMP(this.gameState.player.mp);
        }

        const damage = Math.floor(Math.random() * 35) + 15 + this.gameState.player.level * 3;
        this.gameState.currentBattle.enemy.hp -= damage;

        this.addBattleLog(`你使用特殊技能（消耗 ${mpCost} MP），對 ${this.gameState.currentBattle.enemy.name} 造成了 ${damage} 點傷害！`);

        if (this.gameState.currentBattle.enemy.hp <= 0) {
            this.gameState.currentBattle.enemy.hp = 0;
            this.updateBattleHP();
            this.winBattle();
            return;
        }

        this.updateBattleHP();
        this.gameState.currentBattle.turn = 'enemy';
        setTimeout(() => this.enemyTurn(), 1000);
    }

    enemyTurn() {
        if (this.gameState.currentBattle.turn !== 'enemy') return;

        const damage = Math.floor(Math.random() * 15) + 5 + this.gameState.currentBattle.enemy.level;
        const actualDamage = this.gameState.currentBattle.defending ? Math.floor(damage / 2) : damage;

        this.gameState.currentBattle.player.hp -= actualDamage;
        this.gameState.player.hp = this.gameState.currentBattle.player.hp; // 同步回主狀態

        // 同步到主介面遊戲狀態系統
        if (window.GameState) {
            window.GameState.setHP(this.gameState.player.hp);
        }

        this.addBattleLog(`${this.gameState.currentBattle.enemy.name} 對你造成了 ${actualDamage} 點傷害！`);

        if (this.gameState.currentBattle.defending) {
            this.addBattleLog('防禦減少了一半傷害！');
            this.gameState.currentBattle.defending = false;
        }

        if (this.gameState.currentBattle.player.hp <= 0) {
            this.gameState.currentBattle.player.hp = 0;
            this.updateBattleHP();
            this.loseBattle();
            return;
        }

        this.updateBattleHP();
        this.gameState.currentBattle.turn = 'player';
    }

    winBattle() {
        const exp = this.gameState.currentBattle.enemy.level * 15 + 25;
        this.addBattleLog(`戰鬥勝利！獲得 ${exp} 經驗值！`);

        this.gameState.player.exp += exp;
        this.checkLevelUp();

        setTimeout(() => {
            this.hidePanel('battle-panel');
            // 重新進入遭遇狀態，可以嘗試捕獲
            this.gameState.gameState.inBattle = false;
            this.gameState.gameState.inEncounter = true;

            this.gameState.currentEncounter.hp = Math.max(1, Math.floor(this.gameState.currentEncounter.maxHp * 0.3));

            // 需要重新獲取zone信息來顯示面板
            const zone = this.getCurrentZone();
            this.showEncounterPanel(this.gameState.currentEncounter, zone);
        }, 2000);
    }

    loseBattle() {
        this.addBattleLog('戰鬥失敗...');
        setTimeout(() => {
            this.hidePanel('battle-panel');
            this.gameState.player.hp = Math.floor(this.gameState.player.maxHp * 0.5);

            // 同步到主介面遊戲狀態系統
            if (window.GameState) {
                window.GameState.setHP(this.gameState.player.hp);
            }

            // 解鎖移動
            this.unlockMovement();
        }, 2000);
    }

    escapeBattle() {
        this.addBattleLog('成功逃脫了戰鬥！');
        setTimeout(() => {
            this.hidePanel('battle-panel');
            // 解鎖移動
            this.unlockMovement();
        }, 1000);
    }

    unlockMovement() {
        this.gameState.gameState.canMove = true;
        this.gameState.gameState.inBattle = false;
        this.gameState.gameState.inEncounter = false;
        this.gameState.currentEncounter = null;
        this.gameState.currentBattle = null;
    }

    getCurrentZone() {
        const player = this.gameState.player;

        for (const zone of this.gameState.encounterZones) {
            const distance = Math.sqrt(
                Math.pow(player.x - zone.x, 2) +
                Math.pow(player.z - zone.z, 2)
            );

            if (distance < zone.radius) {
                return zone;
            }
        }

        // 如果不在任何區域內，返回默認區域
        return { type: 'grass', icon: '🌿' };
    }

    attemptCapture() {
        const companion = this.gameState.currentEncounter;
        const captureRate = this.calculateCaptureRate(companion);

        if (Math.random() < captureRate) {
            // 捕獲成功
            if (this.gameState.player.companions.length < 6) {
                this.gameState.player.companions.push({
                    ...companion,
                    hp: companion.maxHp,
                    isWild: false,
                    captureDate: new Date()
                });

                this.addBattleLog(`成功捕獲了 ${companion.name}！`);
                this.gainExp(companion.level * 10);
            } else {
                this.addBattleLog('夥伴槽已滿！無法捕獲更多夥伴。');
            }
        } else {
            this.addBattleLog(`${companion.name} 掙脫了捕獲！`);
        }

        setTimeout(() => {
            this.hidePanel('encounter-panel');
            this.unlockMovement();
        }, 2000);
        this.updateUI();
    }

    calculateCaptureRate(companion) {
        const rarityModifier = {
            'common': 0.7,
            'rare': 0.5,
            'epic': 0.3,
            'legendary': 0.15
        };

        const hpModifier = (companion.maxHp - companion.hp) / companion.maxHp;
        const levelDiff = Math.max(0, this.gameState.player.level - companion.level) * 0.05;

        return Math.min(0.95, (rarityModifier[companion.rarity] || 0.5) + hpModifier * 0.3 + levelDiff);
    }

    showNPCDialogue(location) {
        const panel = document.getElementById('npc-panel');
        const avatar = document.getElementById('npc-avatar');
        const name = document.getElementById('npc-name');
        const message = document.getElementById('npc-message');

        avatar.textContent = location.npc.avatar;
        name.textContent = location.npc.name;
        message.textContent = location.npc.message;

        this.gameState.currentNpc = location.npc;
        panel.style.display = 'block';
    }

    addBattleLog(message) {
        const log = document.getElementById('battle-log');
        const p = document.createElement('p');
        p.textContent = message;
        log.appendChild(p);
        log.scrollTop = log.scrollHeight;
    }

    checkLevelUp() {
        while (this.gameState.player.exp >= this.gameState.player.expToNext) {
            this.gameState.player.exp -= this.gameState.player.expToNext;
            this.gameState.player.level++;
            this.gameState.player.expToNext = this.gameState.player.level * 100;
            this.gameState.player.maxHp += 10;
            this.gameState.player.hp = this.gameState.player.maxHp;

            this.addBattleLog(`恭喜升級！現在是 ${this.gameState.player.level} 級！`);
        }
    }

    gainExp(amount) {
        this.gameState.player.exp += amount;
        this.checkLevelUp();
        this.updateUI();
    }

    hidePanel(panelId) {
        document.getElementById(panelId).style.display = 'none';
    }

    gameLoop() {
        this.updatePlayer();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

// 初始化遊戲
document.addEventListener('DOMContentLoaded', function() {
    // 只在地圖 tab 被顯示時初始化遊戲
    let mapGame = null;

    function initMapGame() {
        if (!mapGame && document.getElementById('world-map')) {
            mapGame = new WebGLMapGame('world-map', 'minimap');
        }
    }

    // 監聽 tab 切換
    const mapTab = document.querySelector('[data-tab="map"]');
    if (mapTab) {
        mapTab.addEventListener('click', () => {
            // 延遲初始化，確保 canvas 已經顯示
            setTimeout(initMapGame, 100);
        });
    }

    // 如果地圖 tab 已經是活動狀態，直接初始化
    const mapTabPanel = document.getElementById('map-tab');
    if (mapTabPanel && mapTabPanel.classList.contains('active')) {
        initMapGame();
    }
});