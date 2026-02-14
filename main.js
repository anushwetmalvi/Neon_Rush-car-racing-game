
// Car Configurations
const CARS = {
    'starter': {
        name: 'NEON RACER I',
        price: 0,
        color: 0x00ffff,
        speed: 40,
        handling: 50,
        modelType: 'sport'
    },
    'muscle': {
        name: 'STREET BEAST',
        price: 500,
        color: 0xff0055,
        speed: 55,
        handling: 30,
        modelType: 'muscle'
    },
    'tank': {
        name: 'ENFORCER',
        price: 1200,
        color: 0x00ff00,
        speed: 35,
        handling: 85,
        modelType: 'tank'
    },
    'cyber': {
        name: 'V-TECH 2077',
        price: 2500,
        color: 0xffd700,
        speed: 70,
        handling: 70,
        modelType: 'cyber'
    }
};

const UPGRADES = {
    'engine': { name: 'Engine Tune', cost: 200, stat: 'speed', boost: 5, max: 5 },
    'tires': { name: 'Cyber Grip', cost: 150, stat: 'handling', boost: 5, max: 5 }
};

class DataManager {
    constructor() {
        this.load();
    }

    load() {
        try {
            const data = localStorage.getItem('neon_rush_save');
            if (data) {
                this.saveData = JSON.parse(data);
                // Schema migration/validation
                if (!this.saveData.ownedCars) this.saveData.ownedCars = ['starter'];
                if (!this.saveData.currentCar) this.saveData.currentCar = 'starter';
                if (!this.saveData.coins) this.saveData.coins = 0;
            } else {
                throw new Error("No save data");
            }
        } catch (e) {
            this.saveData = {
                coins: 100, // Bonus starter coins
                ownedCars: ['starter'],
                currentCar: 'starter',
                carUpgrades: { 'starter': { engine: 0, tires: 0 } }
            };
        }
        // Ensure upgrades object exists
        if (!this.saveData.carUpgrades) this.saveData.carUpgrades = {};
        this.saveData.ownedCars.forEach(id => {
            if (!this.saveData.carUpgrades[id]) this.saveData.carUpgrades[id] = { engine: 0, tires: 0 };
        });
    }

    save() {
        localStorage.setItem('neon_rush_save', JSON.stringify(this.saveData));
    }

    addCoins(amount) {
        this.saveData.coins += amount;
        this.save();
    }

    buyCar(id) {
        const car = CARS[id];
        if (this.saveData.coins >= car.price && !this.saveData.ownedCars.includes(id)) {
            this.saveData.coins -= car.price;
            this.saveData.ownedCars.push(id);
            this.saveData.carUpgrades[id] = { engine: 0, tires: 0 };
            this.save();
            return true;
        }
        return false;
    }

    buyUpgrade(type) {
        const carId = this.saveData.currentCar;
        const upgrade = UPGRADES[type];
        const currentLevel = this.saveData.carUpgrades[carId][type];

        if (this.saveData.coins >= upgrade.cost && currentLevel < upgrade.max) {
            this.saveData.coins -= upgrade.cost;
            this.saveData.carUpgrades[carId][type]++;
            this.save();
            return true;
        }
        return false;
    }

    equipCar(id) {
        if (this.saveData.ownedCars.includes(id)) {
            this.saveData.currentCar = id;
            this.save();
            return true;
        }
        return false;
    }

    getStats(carId) {
        const base = CARS[carId];
        const upgrades = this.saveData.carUpgrades[carId];
        return {
            speed: base.speed + (upgrades.engine * UPGRADES.engine.boost),
            handling: base.handling + (upgrades.tires * UPGRADES.tires.boost)
        };
    }
}

class Game {
    constructor() {
        console.log("Initializing Game...");
        this.data = new DataManager();
        this.container = document.getElementById('game-container');

        // Setup Scene
        const oldCanvas = document.getElementById('gameCanvas');
        if (oldCanvas) oldCanvas.remove();

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050510);
        this.scene.fog = new THREE.FogExp2(0x050510, 0.002);

        this.camera = new THREE.PerspectiveCamera(60, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.set(0, 15, 30);
        this.camera.lookAt(0, 0, -20);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.domElement.id = 'gameCanvas';
        this.container.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Brighter
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(20, 50, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        this.scene.add(dirLight);

        // UI Elements
        this.startScreen = document.getElementById('start-screen');
        this.shopScreen = document.getElementById('shop-screen');
        this.garageScreen = document.getElementById('garage-screen');
        this.gameOverScreen = document.getElementById('game-over-screen');

        this.scoreDisplay = document.getElementById('scoreDisplay');
        this.speedDisplay = document.getElementById('speedDisplay');
        this.menuCoins = document.getElementById('menuCoins');
        this.shopCoins = document.getElementById('shopCoins');

        this.bindEvents();
        try {
            this.updateMenuUI();
        } catch (e) { console.error("Error updating UI", e); }

        window.addEventListener('resize', () => this.resize());

        // Simulation
        this.clock = new THREE.Clock();
        this.input = new InputHandler();
        this.player = new Player(this);
        this.road = new Road(this);
        this.city = new City(this); // Add Background City
        this.enemies = [];
        this.particles = [];
        this.enemyTimer = 0;
        this.state = 'MENU';

        this.loop();
    }

    bindEvents() {
        document.getElementById('startBtn').addEventListener('click', () => this.start());
        document.getElementById('restartBtn').addEventListener('click', () => this.reset());

        // Shop
        document.getElementById('shopBtn').addEventListener('click', () => this.openShop());
        document.getElementById('closeShopBtn').addEventListener('click', () => this.closeScreens());

        // Garage
        document.getElementById('garageBtn').addEventListener('click', () => this.openGarage());
        document.getElementById('closeGarageBtn').addEventListener('click', () => this.closeScreens());
        document.getElementById('equipBtn').addEventListener('click', () => {
            this.data.equipCar(this.selectedGarageCar);
            this.updateGarageUI();
            this.updateMenuUI();
            this.player.reloadModel();
        });

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.populateShop(e.target.dataset.tab);
            });
        });
    }

    updateMenuUI() {
        this.menuCoins.innerText = this.data.saveData.coins;
        this.shopCoins.innerText = this.data.saveData.coins;
    }

    closeScreens() {
        this.startScreen.classList.remove('hidden');
        this.shopScreen.classList.add('hidden');
        this.garageScreen.classList.add('hidden');
        this.player.reloadModel(); // Refresh look in background
    }

    openShop() {
        this.startScreen.classList.add('hidden');
        this.shopScreen.classList.remove('hidden');
        this.updateMenuUI();
        this.populateShop('cars');
    }

    populateShop(tab) {
        const container = document.getElementById('shopContent');
        container.innerHTML = '';

        if (tab === 'cars') {
            Object.keys(CARS).forEach(id => {
                const car = CARS[id];
                const owned = this.data.saveData.ownedCars.includes(id);
                const div = document.createElement('div');
                div.className = `item-card ${owned ? 'disabled' : ''}`;
                div.innerHTML = `
                    <div class="item-name">${car.name}</div>
                    <div class="item-cost">${owned ? 'OWNED' : car.price + ' ₵'}</div>
                    <div style="font-size:0.8em; color:#aaa">Speed: ${car.speed}</div>
                    <div style="font-size:0.8em; color:#aaa; margin-bottom:10px">Handling: ${car.handling}</div>
                    <button class="btn" style="padding:5px 15px; font-size:0.8em">${owned ? 'OWNED' : 'BUY'}</button>
                `;
                if (!owned) {
                    div.querySelector('button').addEventListener('click', () => {
                        if (this.data.buyCar(id)) {
                            this.updateMenuUI();
                            this.populateShop('cars');
                        } else {
                            alert('Not enough coins!');
                        }
                    });
                }
                container.appendChild(div);
            });
        } else {
            // Upgrades
            Object.keys(UPGRADES).forEach(type => {
                const upg = UPGRADES[type];
                const currentCar = this.data.saveData.currentCar;
                const level = this.data.saveData.carUpgrades[currentCar][type];
                const maxed = level >= upg.max;

                const div = document.createElement('div');
                div.className = `item-card ${maxed ? 'disabled' : ''}`;
                div.innerHTML = `
                    <div class="item-name">${upg.name}</div>
                    <div class="item-cost">${maxed ? 'MAXED' : upg.cost + ' ₵'}</div>
                    <div style="font-size:0.8em; color:#aaa">Current Level: ${level}/${upg.max}</div>
                    <div style="font-size:0.8em; color:#aaa; margin-bottom:10px">+${upg.boost} ${upg.stat}</div>
                    <button class="btn" style="padding:5px 15px; font-size:0.8em">UPGRADE</button>
                `;
                if (!maxed) {
                    div.querySelector('button').addEventListener('click', () => {
                        if (this.data.buyUpgrade(type)) {
                            this.updateMenuUI();
                            this.populateShop('upgrades'); // Refresh to show new level
                        } else {
                            if (this.data.saveData.coins < upg.cost) alert('Not enough coins!');
                        }
                    });
                }
                container.appendChild(div);
            });
        }
    }

    openGarage() {
        this.startScreen.classList.add('hidden');
        this.garageScreen.classList.remove('hidden');
        this.selectedGarageCar = this.data.saveData.currentCar;
        this.updateGarageUI();
    }

    updateGarageUI() {
        const list = document.getElementById('garageCarList');
        list.innerHTML = '';

        this.data.saveData.ownedCars.forEach(id => {
            const car = CARS[id];
            const div = document.createElement('div');
            div.className = `car-item ${this.selectedGarageCar === id ? 'selected' : ''}`;
            div.innerHTML = `<span>${car.name}</span>${id === this.data.saveData.currentCar ? '<small style="color:cyan">EQUIPPED</small>' : ''}`;
            div.addEventListener('click', () => {
                this.selectedGarageCar = id;
                this.updateGarageUI();
            });
            list.appendChild(div);
        });

        // Details
        const stats = this.data.getStats(this.selectedGarageCar);
        const base = CARS[this.selectedGarageCar];
        document.getElementById('selectedCarName').innerText = base.name;

        // Normalize stats for display (assume max 100)
        document.getElementById('statSpeed').style.width = stats.speed + '%';
        document.getElementById('statHandling').style.width = stats.handling + '%';

        const equipBtn = document.getElementById('equipBtn');
        if (this.selectedGarageCar === this.data.saveData.currentCar) {
            equipBtn.disabled = true;
            equipBtn.innerText = 'EQUIPPED';
            equipBtn.style.opacity = 0.5;
        } else {
            equipBtn.disabled = false;
            equipBtn.innerText = 'EQUIP';
            equipBtn.style.opacity = 1;
        }
    }

    resize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    start() {
        this.state = 'PLAYING';
        this.startScreen.classList.add('hidden');
        this.shopScreen.classList.add('hidden');
        this.garageScreen.classList.add('hidden');

        this.score = 0;

        // Set speed based on car stats
        const stats = this.data.getStats(this.data.saveData.currentCar);
        this.baseSpeed = stats.speed + 10;
        this.maxSpeed = this.baseSpeed + 100;
        this.speed = this.baseSpeed;

        this.enemies.forEach(e => this.scene.remove(e.mesh));
        this.enemies = [];
        this.particles.forEach(p => this.scene.remove(p.mesh));
        this.particles = [];

        this.player.reset();
        this.clock.start();
    }

    reset() {
        this.gameOverScreen.classList.add('hidden');
        this.startScreen.classList.remove('hidden'); // Go back to menu instead of instant restart
        this.state = 'MENU';
    }

    gameOver() {
        this.state = 'GAMEOVER';
        this.gameOverScreen.classList.remove('hidden');
        const earned = Math.floor(this.score / 10);
        this.data.addCoins(earned);

        document.getElementById('finalScore').innerHTML = `${Math.floor(this.score)}<br><span style="font-size:0.5em; color:white">EARNED: ${earned} ₵</span>`;
        this.updateMenuUI();

        for (let i = 0; i < 30; i++) {
            this.particles.push(new Particle(this, this.player.mesh.position, 0xff0000));
        }
    }

    loop() {
        requestAnimationFrame(() => this.loop());
        const dt = this.clock.getDelta();

        if (this.state === 'PLAYING') {
            this.update(dt);
        } else if (this.state === 'GAMEOVER') {
            this.updateParticles(dt);
        }

        this.road.animate(this.speed * dt);
        this.renderer.render(this.scene, this.camera);
    }

    update(dt) {
        if (this.speed < this.maxSpeed) {
            this.speed += dt * 2;
        }

        this.player.update(dt);
        this.updateEnemies(dt);
        this.updateParticles(dt);
        this.city.update(dt, this.speed);

        this.score += (this.speed * dt);
        this.scoreDisplay.innerText = Math.floor(this.score);
        this.speedDisplay.innerText = Math.floor(this.speed * 3);
    }

    updateEnemies(dt) {
        this.enemyTimer -= dt;
        if (this.enemyTimer <= 0) {
            this.spawnEnemy();
            const factor = Math.max(0.3, 1.8 - (this.speed / this.maxSpeed));
            this.enemyTimer = factor + Math.random() * 0.5;
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(dt);
            if (enemy.mesh.position.z > 20) {
                this.scene.remove(enemy.mesh);
                this.enemies.splice(i, 1);
                continue;
            }
            if (this.checkCollision(this.player.mesh, enemy.mesh)) {
                this.gameOver();
            }
        }
    }

    updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (this.particles[i].life <= 0) {
                this.scene.remove(this.particles[i].mesh);
                this.particles.splice(i, 1);
            }
        }
    }

    spawnEnemy() {
        const lanes = [-9, -3, 3, 9];
        const x = lanes[Math.floor(Math.random() * lanes.length)];
        const enemy = new Enemy(this, x, -120);
        this.enemies.push(enemy);
    }

    checkCollision(mesh1, mesh2) {
        const dx = Math.abs(mesh1.position.x - mesh2.position.x);
        const dz = Math.abs(mesh1.position.z - mesh2.position.z);
        return dx < 3.0 && dz < 5.0;
    }
}

class InputHandler {
    constructor() {
        this.keys = {};
        window.addEventListener('keydown', e => this.keys[e.key] = true);
        window.addEventListener('keyup', e => this.keys[e.key] = false);
        this.touchX = null;
        window.addEventListener('touchstart', e => this.touchX = e.touches[0].clientX, { passive: false });
        window.addEventListener('touchmove', e => { e.preventDefault(); this.touchX = e.touches[0].clientX; }, { passive: false });
        window.addEventListener('touchend', () => this.touchX = null);
    }
}

class Player {
    constructor(game) {
        this.game = game;
        this.speedX = 0;
        this.reloadModel();
    }

    reloadModel() {
        if (this.mesh) this.game.scene.remove(this.mesh);

        const currentCarId = this.game.data.saveData.currentCar;
        const config = CARS[currentCarId];

        this.mesh = this.createModel(config);
        this.mesh.position.set(0, 1, 0);
        this.game.scene.add(this.mesh);

        // Update physics stats
        const stats = this.game.data.getStats(currentCarId);
        this.maxSpeedX = stats.handling; // Map handling stat to strafe speed
        this.friction = 0.9;
    }

    createModel(config) {
        const group = new THREE.Group();
        const color = config.color;

        // Model Switcher
        if (config.modelType === 'muscle') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(4, 1.8, 8), new THREE.MeshPhongMaterial({ color, shininess: 80 }));
            body.castShadow = true;
            group.add(body);
            const hood = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 3), new THREE.MeshPhongMaterial({ color: 0x111111 }));
            hood.position.set(0, 1, 1);
            group.add(hood);
        } else if (config.modelType === 'tank') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 7), new THREE.MeshPhongMaterial({ color, shininess: 20 }));
            body.castShadow = true;
            group.add(body);
            const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 3), new THREE.MeshPhongMaterial({ color: 0x222222 }));
            cabin.position.set(0, 1.5, 0);
            group.add(cabin);
        } else {
            // Sport / Cyber
            const body = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.5, 7), new THREE.MeshPhongMaterial({ color, emissive: 0x001111, shininess: 100 }));
            body.castShadow = true;
            group.add(body);
            const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 3), new THREE.MeshPhongMaterial({ color: 0x111111 }));
            cabin.position.set(0, 1.25, 0);
            group.add(cabin);
        }

        // Glow Engines (Common)
        const engineGeo = new THREE.BoxGeometry(0.5, 0.5, 1);
        const engineMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        const engineL = new THREE.Mesh(engineGeo, engineMat);
        const engineR = new THREE.Mesh(engineGeo, engineMat);
        engineL.position.set(-1.2, 0, 3.5);
        engineR.position.set(1.2, 0, 3.5);
        group.add(engineL);
        group.add(engineR);

        // Point Light
        const light = new THREE.PointLight(color, 1, 20);
        light.position.set(0, 3, 0);
        group.add(light);

        return group;
    }

    reset() {
        this.mesh.position.set(0, 1, 0);
        this.speedX = 0;
        this.mesh.rotation.set(0, 0, 0);
    }

    update(dt) {
        let inputX = 0;
        const keys = this.game.input.keys;
        if (keys['ArrowLeft'] || keys['a']) inputX = -1;
        if (keys['ArrowRight'] || keys['d']) inputX = 1;

        if (this.game.input.touchX !== null) {
            const center = window.innerWidth / 2;
            inputX = this.game.input.touchX < center ? -1 : 1;
        }

        if (inputX !== 0) {
            this.speedX += inputX * (this.maxSpeedX * 4) * dt; // Responsive
        } else {
            this.speedX *= this.friction;
        }

        this.speedX = THREE.MathUtils.clamp(this.speedX, -this.maxSpeedX, this.maxSpeedX);
        this.mesh.position.x += this.speedX * dt;

        this.mesh.rotation.z = -this.speedX * 0.01;
        this.mesh.rotation.y = -this.speedX * 0.005;

        const limit = 12;
        if (this.mesh.position.x < -limit) { this.mesh.position.x = -limit; this.speedX = 0; }
        if (this.mesh.position.x > limit) { this.mesh.position.x = limit; this.speedX = 0; }
    }
}

class Enemy {
    constructor(game, x, z) {
        this.game = game;
        this.mesh = this.createModel();
        this.mesh.position.set(x, 1, z);
        this.game.scene.add(this.mesh);
        this.driveSpeed = 20;
    }

    createModel() {
        const group = new THREE.Group();
        const color = Math.random() > 0.5 ? 0xff0055 : 0xffff00;
        const body = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.5, 7), new THREE.MeshPhongMaterial({ color }));
        body.castShadow = true;
        group.add(body);
        const top = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 3), new THREE.MeshPhongMaterial({ color: 0x222222 }));
        top.position.y = 1;
        group.add(top);

        // Tail lights
        const tailGeo = new THREE.BoxGeometry(0.5, 0.3, 0.1);
        const tailMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const tailL = new THREE.Mesh(tailGeo, tailMat);
        const tailR = new THREE.Mesh(tailGeo, tailMat);
        tailL.position.set(-1, 0.5, 3.55);
        tailR.position.set(1, 0.5, 3.55);
        group.add(tailL);
        group.add(tailR);

        return group;
    }

    update(dt) {
        const relativeSpeed = this.game.speed - this.driveSpeed;
        this.mesh.position.z += relativeSpeed * dt;
    }
}

class City {
    constructor(game) {
        this.game = game;
        this.group = new THREE.Group();
        this.game.scene.add(this.group);

        // Create buildings
        this.buildings = [];
        for (let i = 0; i < 40; i++) {
            // Left side
            this.spawnBuilding(-50 - Math.random() * 50);
            // Right side
            this.spawnBuilding(50 + Math.random() * 50);
        }
    }

    spawnBuilding(xOffset) {
        const h = 20 + Math.random() * 60;
        const w = 10 + Math.random() * 10;
        const d = 10 + Math.random() * 10;

        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            new THREE.MeshStandardMaterial({
                color: Math.random() > 0.8 ? 0x222233 : 0x111116,
                roughness: 0.2
            })
        );

        // Random neon window
        if (Math.random() > 0.5) {
            const win = new THREE.Mesh(
                new THREE.PlaneGeometry(w * 0.8, h * 0.8),
                new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xff0055 : 0x00ffff })
            );
            win.position.z = d / 2 + 0.1;
            if (xOffset > 0) win.rotation.y = Math.PI; // Face inward
            mesh.add(win);
        }

        mesh.position.set(xOffset, h / 2 - 10, -100 + Math.random() * 200);
        this.group.add(mesh);
        this.buildings.push(mesh);
    }

    update(dt, speed) {
        // Move buildings towards camera to simulate speed
        const move = speed * dt;
        this.buildings.forEach(b => {
            b.position.z += move; // Move +Z
            if (b.position.z > 50) {
                b.position.z -= 300; // Reset far back
                // Randomize height again?
                b.scale.y = 0.5 + Math.random();
            }
        });
    }
}

class Road {
    constructor(game) {
        this.game = game;

        // Base Ground
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x050510 }));
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -0.2;
        this.game.scene.add(plane);

        // Grid (Vaporwave style)
        const gridHelper = new THREE.GridHelper(400, 100, 0xbd00ff, 0xbd00ff);
        this.grid = gridHelper;
        this.grid.position.y = -0.1;
        this.game.scene.add(this.grid);

        this.createWalls();
        this.createMarkings();
        this.createStreetLights();
    }

    createWalls() {
        const wallGeo = new THREE.BoxGeometry(1, 4, 400);
        const wallMat = new THREE.MeshBasicMaterial({ color: 0xbd00ff });
        this.leftWall = new THREE.Mesh(wallGeo, wallMat);
        this.leftWall.position.set(-15, 0, 0);
        this.game.scene.add(this.leftWall);
        this.rightWall = new THREE.Mesh(wallGeo, wallMat);
        this.rightWall.position.set(15, 0, 0);
        this.game.scene.add(this.rightWall);
    }

    createMarkings() {
        this.markings = [];
        const geometry = new THREE.PlaneGeometry(0.5, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // Create 3 lanes means 2 separating lines? Positioned at -5 and +5 approx
        for (let i = 0; i < 20; i++) {
            // Left line
            const m1 = new THREE.Mesh(geometry, material);
            m1.rotation.x = -Math.PI / 2;
            m1.position.set(-5, 0.01, -100 + i * 20);
            this.game.scene.add(m1);
            this.markings.push(m1);

            // Right line
            const m2 = new THREE.Mesh(geometry, material);
            m2.rotation.x = -Math.PI / 2;
            m2.position.set(5, 0.01, -100 + i * 20);
            this.game.scene.add(m2);
            this.markings.push(m2);
        }
    }

    createStreetLights() {
        this.lights = [];
        // Pole visual
        const poleGeo = new THREE.BoxGeometry(0.5, 10, 0.5);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const armGeo = new THREE.BoxGeometry(4, 0.5, 0.5);

        for (let i = 0; i < 10; i++) {
            const z = -100 + i * 40;
            this.spawnLightPair(z, poleGeo, poleMat, armGeo);
        }
    }

    spawnLightPair(z, poleGeo, poleMat, armGeo) {
        // Left Light
        this.createLight(-18, z, 1, poleGeo, poleMat, armGeo);
        // Right Light
        this.createLight(18, z, -1, poleGeo, poleMat, armGeo);
    }

    createLight(x, z, dir, poleGeo, poleMat, armGeo) {
        const group = new THREE.Group();
        group.position.set(x, 5, z);

        // Pole
        const pole = new THREE.Mesh(poleGeo, poleMat);
        group.add(pole);

        // Arm
        const arm = new THREE.Mesh(armGeo, poleMat);
        arm.position.set(dir * 2, 5, 0);
        group.add(arm);

        // Bulb glow (Visual only, no actual expensive light source to prevent breaking other objects)
        const bulb = new THREE.Mesh(
            new THREE.BoxGeometry(1, 0.5, 1),
            new THREE.MeshBasicMaterial({ color: 0xffffaa })
        );
        bulb.position.set(dir * 3.5, 4.5, 0);
        group.add(bulb);

        // Fake light cone using transparent mesh instead of real light
        const coneGeo = new THREE.ConeGeometry(2, 8, 32, 1, true);
        const coneMat = new THREE.MeshBasicMaterial({
            color: 0xffffaa,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.set(dir * 3.5, 0, 0);
        cone.visible = false; // Hidden for performance/aesthetics, can be enabled if desired
        // group.add(cone); 

        this.game.scene.add(group);
        this.lights.push(group);
    }

    animate(offset) {
        this.grid.position.z = (this.grid.position.z + offset) % 4;

        // Animate markings
        this.markings.forEach(m => {
            m.position.z += offset;
            if (m.position.z > 20) m.position.z -= 400; // Loop back
        });

        // Animate lights
        this.lights.forEach(l => {
            l.position.z += offset;
            if (l.position.z > 20) l.position.z -= 400;
        });
    }
}

class Particle {
    constructor(game, pos, color) {
        this.game = game;
        this.life = 1.0;
        const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const mat = new THREE.MeshBasicMaterial({ color: color });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(pos);
        this.vel = new THREE.Vector3((Math.random() - 0.5) * 20, Math.random() * 20, (Math.random() - 0.5) * 20);
        this.game.scene.add(this.mesh);
    }
    update(dt) {
        this.life -= dt * 1.5;
        this.mesh.position.addScaledVector(this.vel, dt);
        this.mesh.rotation.x += dt * 5;
        this.mesh.scale.setScalar(this.life);
    }
}

window.onload = () => { new Game(); };
