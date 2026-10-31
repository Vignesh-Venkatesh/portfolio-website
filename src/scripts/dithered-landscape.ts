const canvas = document.querySelector<HTMLCanvasElement>("[data-landscape]");

if (canvas) {
    const fullscreen = canvas.dataset.fullscreen === "true";
    const context = canvas.getContext("2d");
    if (context) {
        const scene = document.createElement("canvas");
        const paint = scene.getContext("2d")!;
        const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
        const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
        const accent = getComputedStyle(canvas).getPropertyValue("--color-accent").trim() || "#4ade80";
        const channels = [1, 3, 5].map((offset) => parseInt(accent.slice(offset, offset + 2), 16));
        const palette = [0.035, 0.09, 0.16, 0.25, 0.36, 0.52, 1].map(
            (shade) => `rgb(${channels.map((value) => Math.round(value * shade)).join(",")})`,
        );
        for (const tint of [0.4, 0.8]) {
            palette.push(`rgb(${channels.map((value) => Math.round(value + (255 - value) * tint)).join(",")})`);
        }
        const glyphs = [".", ":", "+", "=", "*", "#", "%", "@", "*"];
        let width = 0;
        let height = 0;
        let ratio = 1;
        let frame = 0;
        let visible = false;
        let previous = 0;
        const treeCells: { x: number; y: number; bend: number; phase: number; fleck: boolean }[] = [];

        function noise(x: number, y: number) {
            const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
            return n - Math.floor(n);
        }

        function ridge(x: number, layer: number) {
            const centers = [0.56, 0.59, 0.52];
            const widths = [0.31, 0.28, 0.35];
            const valley = Math.exp(-Math.pow((x - centers[layer]) / widths[layer], 2));
            const foregroundDip = layer === 2 ? Math.exp(-Math.pow((x - 0.5) / 0.3, 2)) * 0.1 : 0;
            return [0.25, 0.38, 0.54][layer] + valley * [0.23, 0.27, 0.26][layer]
                + Math.sin(x * (10 + layer * 5) + layer * 2) * 0.035
                + Math.sin(x * (29 + layer * 8) + layer) * 0.014 + foregroundDip;
        }

        function prepareTrees() {
            treeCells.length = 0;
            for (const tree of [0.015, 0.05, 0.1, 0.16, 0.92, 0.965, 0.995]) {
                const treeHeight = 0.3 + noise(tree * 100, 4) * 0.35;
                const treeTop = 0.97 - treeHeight;
                for (let y = Math.ceil(treeTop * height / 4) * 4; y < height * 0.97; y += 4) {
                    const depth = (y / height - treeTop) / treeHeight;
                    const spread = depth * (0.45 + ((depth * 4) % 1) * 0.55) * height * 0.15;
                    for (let x = Math.floor((tree * width - spread) / 3) * 3; x < tree * width + spread; x += 3) {
                        treeCells.push({ x, y, bend: Math.pow(1 - depth, 2), phase: tree * 7, fleck: noise(x, y) > 0.7 });
                    }
                }
            }
        }

        function renderScene() {
            const stepX = 3;
            const stepY = 4;
            paint.fillStyle = palette[0];
            paint.fillRect(0, 0, width, height);
            paint.font = "5px monospace";
            paint.textAlign = "center";
            paint.textBaseline = "middle";
            const moonX = width * 0.19;
            const moonY = height * 0.12;
            const moonRadius = height * 0.075;

            for (let y = 0, row = 0; y < height; y += stepY, row++) {
                for (let x = 0, col = 0; x < width; x += stepX, col++) {
                    const u = x / width;
                    const v = y / height;
                    const grain = noise(col, row);
                    const mist = Math.exp(-Math.pow((u - 0.57) / 0.3, 2) - Math.pow((v - 0.4) / 0.15, 2));
                    const moonDistance = Math.hypot(x - moonX, y - moonY);
                    const halo = Math.exp(-Math.pow(moonDistance / (moonRadius * 2.7), 2));
                    let light = 0.035 + mist * 0.12 + halo * 0.14;

                    // The moon belongs to the sky: every terrain layer can occlude it.
                    if (moonDistance < moonRadius) {
                        const dx = (x - moonX) / moonRadius;
                        const dy = (y - moonY) / moonRadius;
                        const craters = Math.exp(-Math.pow((dx + 0.3) / 0.3, 2) - Math.pow((dy - 0.15) / 0.4, 2)) * 0.12
                            + Math.exp(-Math.pow((dx - 0.35) / 0.22, 2) - Math.pow((dy + 0.25) / 0.3, 2)) * 0.09;
                        light = 0.96 - craters - grain * 0.035;
                    }
                    if (v < 0.23 && grain > 0.9965 && moonDistance > moonRadius * 2) light = 0.55;

                    // Atmospheric perspective: pale distant ridges, darker near slopes.
                    const farRidge = ridge(u, 0);
                    const middleRidge = ridge(u, 1);
                    const nearRidge = ridge(u, 2);
                    if (v > farRidge) {
                        const haze = Math.exp(-Math.pow((v - farRidge) / 0.09, 2));
                        light = 0.39 + grain * 0.025 + haze * 0.07;
                    }
                    if (v > middleRidge) light = 0.25 + grain * 0.035;
                    if (v > nearRidge) light = 0.085 + grain * 0.025;
                    const rock = Math.sin(u * 110 + Math.sin(v * 16) * 2);
                    if (v > middleRidge && v < nearRidge && rock > 0.7) light += 0.025;

                    // Ordered dithering creates deliberate clustered texture rather than random static.
                    const threshold = bayer[(row % 4) * 4 + col % 4] / 16 - 0.5;
                    const index = Math.max(0, Math.min(8, Math.floor(light * 8 + threshold * 1.1)));
                    paint.fillStyle = palette[index];
                    paint.fillRect(x, y, stepX, stepY);
                    paint.fillStyle = palette[Math.min(8, index + 1)];
                    paint.globalAlpha = 0.55;
                    paint.fillText(glyphs[index], x + stepX / 2, y + stepY / 2);
                    paint.globalAlpha = 1;
                }
            }
        }

        function draw(now: number) {
            context!.clearRect(0, 0, width, height);
            context!.drawImage(scene, 0, 0, width, height);
            const time = reducedMotion.matches ? 0 : now / 1000;
            context!.globalAlpha = 1;
            // Wind bends the crowns; the displacement falls to zero at each tree's base.
            context!.font = "5px monospace";
            const breezeScale = fullscreen ? Math.min(4, height / 192) : 1;
            for (const cell of treeCells) {
                const wind = reducedMotion.matches ? 0 : Math.sin(time * 0.65 + cell.phase * 0.25) * 2.4
                    + Math.sin(time * 1.1 + cell.phase) * 0.5;
                const x = cell.x + wind * cell.bend * breezeScale;
                context!.fillStyle = palette[0];
                context!.fillRect(x, cell.y, 3.5, 4);
                if (cell.fleck) {
                    context!.fillStyle = palette[1];
                    context!.globalAlpha = 0.35;
                    context!.fillText(".", x + 1.5, cell.y + 2);
                    context!.globalAlpha = 1;
                }
            }
            // Small luminous motes give the otherwise still scenery a little life.
            const fireflyCount = fullscreen ? Math.min(14, Math.max(8, Math.round(width * height / 120000))) : 7;
            for (let i = 0; i < fireflyCount; i++) {
                const time = reducedMotion.matches ? 0 : now / 1000;
                const horizontalPosition = fullscreen
                    ? (i + 0.25 + noise(i, 9) * 0.5) / fireflyCount
                    : 0.05 + noise(i, 9) * 0.9;
                const drift = fullscreen ? Math.min(22, width / fireflyCount * 0.3) : 9;
                const x = horizontalPosition * width + Math.sin(time * 0.3 + i) * drift;
                const y = height * (0.48 + noise(i, 3) * 0.4) + Math.cos(time * 0.4 + i * 2) * (fullscreen ? 12 : 5);
                const radius = fullscreen ? 12 : 14;
                if (fullscreen) context!.globalAlpha = 0.4 + (Math.sin(time * 0.55 + i * 2.1) + 1) * 0.3;
                const glow = context!.createRadialGradient(x, y, 0, x, y, radius);
                glow.addColorStop(0, `${accent}55`);
                glow.addColorStop(1, `${accent}00`);
                context!.fillStyle = glow;
                context!.fillRect(x - radius, y - radius, radius * 2, radius * 2);
                context!.globalAlpha = fullscreen ? 0.55 + Math.sin(time * 0.55 + i * 2.1) * 0.3 : 0.4 + Math.sin(time + i) * 0.2;
                context!.fillStyle = palette[7];
                context!.fillRect(Math.round(x), Math.round(y), 2, 2);
            }
            context!.globalAlpha = 1;
        }

        function animate(now: number) {
            if (now - previous > 1000 / 12) {
                draw(now);
                previous = now;
            }
            frame = requestAnimationFrame(animate);
        }

        function updateAnimation() {
            cancelAnimationFrame(frame);
            draw(performance.now());
            if (visible && !document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(animate);
        }

        new ResizeObserver(() => {
            const bounds = canvas.getBoundingClientRect();
            width = bounds.width;
            height = bounds.height;
            ratio = Math.min(devicePixelRatio || 1, 2);
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            scene.width = Math.round(width * ratio);
            scene.height = Math.round(height * ratio);
            paint.setTransform(ratio, 0, 0, ratio, 0, 0);
            renderScene();
            prepareTrees();
            draw(performance.now());
        }).observe(canvas);

        new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            updateAnimation();
        }).observe(canvas);
        reducedMotion.addEventListener("change", updateAnimation);
        document.addEventListener("visibilitychange", updateAnimation);
    }
}
