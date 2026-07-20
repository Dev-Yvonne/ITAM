/**
 * DASHBOARD MODULE - ITAM SYSTEM
 * Handles dashboard interactivity: typewriter, greeting, stats animation
 */

(function() {
    'use strict';
    
    // ============================================
    // Configuration
    // ============================================
    var TYPING_SPEED = 70;
    var ERASING_SPEED = 35;
    var PAUSE_BEFORE_ERASE = 3000;
    var PAUSE_BEFORE_TYPING = 500;
    
    var typewriterMessages = [
        'Welcome to ITAM V4',
        'Manage your assets efficiently',
        'Track assignments in real-time',
        'Stay on top of maintenance',
        'Your IT assets, organized'
    ];
    
    var isStatsAnimated = false;
    var statsObserver = null;
    var greetingContext = {
        todayActivityCount: 0,
        busyDayThreshold: 3
    };
    
    // ============================================
    // Greeting + continuous day/night sky cycle
    // ============================================
    function isLateNightHour(hour) {
        return hour === 23 || hour === 0 || hour === 1 || hour === 2;
    }

    function isEarlyCoffeeHour(hour) {
        return hour >= 5 && hour <= 8;
    }

    function getDecimalHour(now) {
        now = now || new Date();
        return now.getHours() + (now.getMinutes() / 60) + (now.getSeconds() / 3600);
    }

    function getSkyPeriod(now) {
        var decimal = getDecimalHour(now);

        if (decimal >= 5.5 && decimal < 11) {
            return 'morning';
        }
        if (decimal >= 11 && decimal < 15) {
            return 'noon';
        }
        // Keep evening greeting through the dusk window until full night at 20:00.
        if (decimal >= 15 && decimal < 20) {
            return 'sunset';
        }
        return 'night';
    }

    function getStandardGreeting(now) {
        var period = getSkyPeriod(now);
        if (period === 'morning') {
            return 'Good Morning';
        }
        if (period === 'noon') {
            return 'Good Afternoon';
        }
        if (period === 'sunset') {
            return 'Good Evening';
        }
        return 'Good Night';
    }

    function getGreeting(now) {
        now = now || new Date();
        var hour = now.getHours();

        if (isLateNightHour(hour)) {
            return 'Late night';
        }
        if (isEarlyCoffeeHour(hour)) {
            return 'Coffee and ITAM';
        }
        if (greetingContext.todayActivityCount >= greetingContext.busyDayThreshold) {
            return 'Busy day at the office';
        }
        return getStandardGreeting(now);
    }

    function setGreetingActivity(count, threshold) {
        greetingContext.todayActivityCount = Number(count) || 0;
        if (threshold !== undefined && threshold !== null) {
            greetingContext.busyDayThreshold = Number(threshold) || 3;
        }
        updateGreeting();
    }

    function clamp01(value) {
        return Math.min(1, Math.max(0, value));
    }

    function lerp(a, b, t) {
        return a + ((b - a) * t);
    }

    function parseHexColor(hex) {
        var value = String(hex || '').replace('#', '');
        if (value.length === 3) {
            value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
        }
        return {
            r: parseInt(value.slice(0, 2), 16),
            g: parseInt(value.slice(2, 4), 16),
            b: parseInt(value.slice(4, 6), 16)
        };
    }

    function toHexColor(r, g, b) {
        function part(n) {
            var hex = Math.round(Math.min(255, Math.max(0, n))).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }
        return '#' + part(r) + part(g) + part(b);
    }

    function lerpColor(a, b, t) {
        var ca = parseHexColor(a);
        var cb = parseHexColor(b);
        return toHexColor(
            lerp(ca.r, cb.r, t),
            lerp(ca.g, cb.g, t),
            lerp(ca.b, cb.b, t)
        );
    }

    function easeInOut(t) {
        return t < 0.5 ? (2 * t * t) : (1 - (Math.pow((-2 * t) + 2, 2) / 2));
    }

    /*
     * Continuous 24h sky keyframes (local time).
     * Evening: 17:30 orange sunset → 18:30 sun sets left → 19:00 moon rises dim → 20:00 deep night.
     * Morning: reverse of evening around 05:30–06:30.
     */
    var skyKeyframes = [
        {
            t: 0,
            period: 'night',
            sky: ['#05070d', '#070b16', '#0b1220', '#0f172a'],
            angle: 180,
            sun: { x: -12, y: 78, opacity: 0, warmth: 1, size: 5 },
            moon: { x: 18, y: 28, opacity: 1, bright: 1, size: 3.6 },
            stars: 1,
            beams: 0,
            nightUi: 1,
            cloud: 0.45
        },
        {
            t: 4.5,
            period: 'night',
            sky: ['#05070d', '#08101c', '#0c1526', '#111827'],
            angle: 180,
            sun: { x: -12, y: 78, opacity: 0, warmth: 1, size: 5 },
            moon: { x: 34, y: 48, opacity: 0.92, bright: 0.9, size: 3.5 },
            stars: 1,
            beams: 0,
            nightUi: 1,
            cloud: 0.4
        },
        {
            t: 5.5,
            period: 'night',
            sky: ['#101828', '#1e3a5f', '#3b5f8a', '#7a90b0'],
            angle: 100,
            sun: { x: 108, y: 62, opacity: 0, warmth: 0.85, size: 5 },
            moon: { x: 42, y: 62, opacity: 0.35, bright: 0.35, size: 3.2 },
            stars: 0.35,
            beams: 0,
            nightUi: 0.55,
            cloud: 0.55
        },
        {
            t: 6.0,
            period: 'morning',
            sky: ['#ffb066', '#ffd3a1', '#a5cff0', '#8fc3ee'],
            angle: 95,
            sun: { x: 104, y: 52, opacity: 0.85, warmth: 0.75, size: 5 },
            moon: { x: 48, y: 78, opacity: 0, bright: 0, size: 3 },
            stars: 0,
            beams: 0.55,
            nightUi: 0.1,
            cloud: 0.85
        },
        {
            t: 6.5,
            period: 'morning',
            sky: ['#8fc3ee', '#a9d4f4', '#cfe7f9', '#ffe0ae'],
            angle: 102,
            sun: { x: 100.5, y: 46, opacity: 1, warmth: 0.55, size: 5 },
            moon: { x: 50, y: 90, opacity: 0, bright: 0, size: 3 },
            stars: 0,
            beams: 0.7,
            nightUi: 0,
            cloud: 0.92
        },
        {
            t: 11,
            period: 'noon',
            sky: ['#5fb2ec', '#83c5f2', '#b6e0f9', '#d7effc'],
            angle: 180,
            sun: { x: 50, y: -4, opacity: 1, warmth: 0.08, size: 5 },
            moon: { x: 50, y: 90, opacity: 0, bright: 0, size: 3 },
            stars: 0,
            beams: 0.55,
            nightUi: 0,
            cloud: 0.95
        },
        {
            t: 15,
            period: 'noon',
            sky: ['#6bb8ef', '#93cdf5', '#c2e5fb', '#f0d9b0'],
            angle: 120,
            sun: { x: 18, y: 18, opacity: 1, warmth: 0.28, size: 5 },
            moon: { x: 50, y: 90, opacity: 0, bright: 0, size: 3 },
            stars: 0,
            beams: 0.5,
            nightUi: 0,
            cloud: 0.9
        },
        {
            t: 17.5,
            period: 'sunset',
            sky: ['#ff9a3c', '#ffb066', '#ffd3a1', '#7cbceb'],
            angle: 88,
            sun: { x: 2, y: 40, opacity: 1, warmth: 1, size: 5.2 },
            moon: { x: -8, y: 78, opacity: 0, bright: 0, size: 3.2 },
            stars: 0,
            beams: 0.85,
            nightUi: 0.05,
            cloud: 0.88
        },
        {
            t: 18.5,
            period: 'night',
            sky: ['#1a2744', '#243b63', '#3d5a80', '#5b7aa0'],
            angle: 88,
            sun: { x: -10, y: 62, opacity: 0, warmth: 1, size: 4.5 },
            moon: { x: -4, y: 70, opacity: 0.15, bright: 0.15, size: 3.2 },
            stars: 0.08,
            beams: 0,
            nightUi: 0.45,
            cloud: 0.55
        },
        {
            t: 19,
            period: 'night',
            sky: ['#0d1424', '#152038', '#1e3358', '#2a4068'],
            angle: 180,
            sun: { x: -12, y: 78, opacity: 0, warmth: 1, size: 4 },
            moon: { x: 8, y: 36, opacity: 0.7, bright: 0.55, size: 3.4 },
            stars: 0.45,
            beams: 0,
            nightUi: 0.85,
            cloud: 0.48
        },
        {
            t: 20,
            period: 'night',
            sky: ['#05070d', '#070b16', '#0b1220', '#0f172a'],
            angle: 180,
            sun: { x: -12, y: 78, opacity: 0, warmth: 1, size: 4 },
            moon: { x: 12, y: 22, opacity: 1, bright: 1, size: 3.6 },
            stars: 1,
            beams: 0,
            nightUi: 1,
            cloud: 0.45
        },
        {
            t: 24,
            period: 'night',
            sky: ['#05070d', '#070b16', '#0b1220', '#0f172a'],
            angle: 180,
            sun: { x: -12, y: 78, opacity: 0, warmth: 1, size: 5 },
            moon: { x: 18, y: 28, opacity: 1, bright: 1, size: 3.6 },
            stars: 1,
            beams: 0,
            nightUi: 1,
            cloud: 0.45
        }
    ];

    function sampleSkyFrame(decimalHour) {
        var frames = skyKeyframes;
        var t = ((decimalHour % 24) + 24) % 24;
        var i;
        for (i = 0; i < frames.length - 1; i += 1) {
            if (t >= frames[i].t && t <= frames[i + 1].t) {
                var span = frames[i + 1].t - frames[i].t;
                var progress = span <= 0 ? 0 : (t - frames[i].t) / span;
                return mixSkyFrames(frames[i], frames[i + 1], easeInOut(clamp01(progress)));
            }
        }
        return frames[0];
    }

    function mixBody(a, b, t) {
        return {
            x: lerp(a.x, b.x, t),
            y: lerp(a.y, b.y, t),
            opacity: lerp(a.opacity, b.opacity, t),
            warmth: a.warmth === undefined ? undefined : lerp(a.warmth, b.warmth, t),
            bright: a.bright === undefined ? undefined : lerp(a.bright, b.bright, t),
            size: lerp(a.size, b.size, t)
        };
    }

    function mixSkyFrames(a, b, t) {
        return {
            period: t < 0.5 ? a.period : b.period,
            sky: [
                lerpColor(a.sky[0], b.sky[0], t),
                lerpColor(a.sky[1], b.sky[1], t),
                lerpColor(a.sky[2], b.sky[2], t),
                lerpColor(a.sky[3], b.sky[3], t)
            ],
            angle: lerp(a.angle, b.angle, t),
            sun: mixBody(a.sun, b.sun, t),
            moon: mixBody(a.moon, b.moon, t),
            stars: lerp(a.stars, b.stars, t),
            beams: lerp(a.beams, b.beams, t),
            nightUi: lerp(a.nightUi, b.nightUi, t),
            cloud: lerp(a.cloud, b.cloud, t)
        };
    }

    function sunBackground(warmth) {
        var core = lerpColor('#ffffff', '#ffe9c2', warmth);
        var mid = lerpColor('#fffdf2', '#ffc26e', warmth);
        var rim = lerpColor('#fff4c2', '#ff9433', warmth);
        var edge = lerpColor('#ffe895', '#ff7712', warmth);
        return 'radial-gradient(circle at 42% 40%, ' +
            core + ' 0%, ' + mid + ' 36%, ' + rim + ' 66%, ' + edge +
            ' 86%, rgba(255, 140, 50, 0.35) 94%, transparent 100%)';
    }

    function sunShadow(warmth) {
        var glow = lerpColor('#ffffff', '#ff8c32', warmth);
        return '0 0 ' + (22 + (warmth * 8)).toFixed(0) + 'px ' + glow +
            'aa, 0 0 ' + (52 + (warmth * 12)).toFixed(0) + 'px ' + glow + '66';
    }

    function moonBackground(bright) {
        var face = lerpColor('#94a3b8', '#f8fafc', bright);
        var mid = lerpColor('#64748b', '#e8eef5', bright);
        var rim = lerpColor('#475569', '#cbd5e1', bright);
        return 'radial-gradient(circle at 62% 34%, rgba(148, 163, 184, ' +
            (0.18 + (0.16 * bright)).toFixed(2) + ') 0%, transparent 12%),' +
            'radial-gradient(circle at 38% 62%, rgba(100, 116, 139, ' +
            (0.14 + (0.14 * bright)).toFixed(2) + ') 0%, transparent 10%),' +
            'radial-gradient(circle at 54% 48%, rgba(148, 163, 184, ' +
            (0.1 + (0.1 * bright)).toFixed(2) + ') 0%, transparent 8%),' +
            'radial-gradient(circle at 40% 36%, ' + face + ' 0%, ' + mid +
            ' 38%, ' + rim + ' 78%, ' + lerpColor('#334155', '#94a3b8', bright) + ' 100%)';
    }

    function moonShadow(bright) {
        return '0 0 ' + (18 + (bright * 14)).toFixed(0) + 'px rgba(186, 210, 255, ' +
            (0.12 + (bright * 0.28)).toFixed(2) + '),' +
            '0 0 ' + (40 + (bright * 20)).toFixed(0) + 'px rgba(99, 102, 241, ' +
            (0.05 + (bright * 0.12)).toFixed(2) + '),' +
            'inset 3px 3px 8px rgba(255, 255, 255, ' +
            (0.1 + (bright * 0.12)).toFixed(2) + ')';
    }

    function applyContinuousSky(now) {
        var welcome = document.getElementById('dashboardWelcome');
        if (!welcome) {
            return;
        }

        var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var decimal = getDecimalHour(now);
        var frame = sampleSkyFrame(decimal);
        var night = frame.nightUi;

        welcome.setAttribute('data-sky-cycle', 'live');
        welcome.setAttribute('data-sky', frame.period);
        welcome.classList.toggle('is-night-sky', night > 0.55);

        welcome.style.setProperty('--sky-c1', frame.sky[0]);
        welcome.style.setProperty('--sky-c2', frame.sky[1]);
        welcome.style.setProperty('--sky-c3', frame.sky[2]);
        welcome.style.setProperty('--sky-c4', frame.sky[3]);
        welcome.style.setProperty('--sky-angle', frame.angle.toFixed(2) + 'deg');
        welcome.style.setProperty('--stars-opacity', frame.stars.toFixed(3));
        welcome.style.setProperty('--beams-opacity', frame.beams.toFixed(3));
        welcome.style.setProperty('--night-ui', night.toFixed(3));
        welcome.style.setProperty(
            '--cloud-fill',
            'rgba(255, 255, 255, ' + frame.cloud.toFixed(3) + ')'
        );
        welcome.style.setProperty(
            '--welcome-fade',
            night > 0.55 ? 'var(--bg-secondary, #1e293b)' : 'var(--bg-secondary, #f8fafc)'
        );

        welcome.style.setProperty('--welcome-fg', lerpColor('#111111', '#f5f5f5', night));
        welcome.style.setProperty('--welcome-muted', lerpColor('#525252', '#a3a3a3', night));
        welcome.style.setProperty(
            '--welcome-badge-bg',
            night > 0.5 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.55)'
        );
        welcome.style.setProperty(
            '--welcome-badge-border',
            night > 0.5 ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.1)'
        );

        var sun = document.getElementById('welcomeSkySun');
        var moon = document.getElementById('welcomeSkyMoon');
        var corona = document.getElementById('welcomeSkyCorona');
        var transition = reduced ? 'none' : 'left 1.1s linear, top 1.1s linear, opacity 1.1s linear, width 1.1s linear, height 1.1s linear, box-shadow 1.1s linear, background 1.1s linear';

        if (sun) {
            sun.style.transition = transition;
            sun.style.left = frame.sun.x.toFixed(2) + '%';
            sun.style.top = frame.sun.y.toFixed(2) + '%';
            sun.style.opacity = frame.sun.opacity.toFixed(3);
            sun.style.width = frame.sun.size.toFixed(2) + 'rem';
            sun.style.height = frame.sun.size.toFixed(2) + 'rem';
            sun.style.background = sunBackground(frame.sun.warmth || 0);
            sun.style.boxShadow = sunShadow(frame.sun.warmth || 0);
            sun.style.border = 'none';
            sun.style.filter = 'none';
        }

        if (moon) {
            moon.style.transition = transition;
            moon.style.left = frame.moon.x.toFixed(2) + '%';
            moon.style.top = frame.moon.y.toFixed(2) + '%';
            moon.style.opacity = frame.moon.opacity.toFixed(3);
            moon.style.width = frame.moon.size.toFixed(2) + 'rem';
            moon.style.height = frame.moon.size.toFixed(2) + 'rem';
            moon.style.borderRadius = '50%';
            moon.style.background = moonBackground(frame.moon.bright || 0);
            moon.style.boxShadow = moonShadow(frame.moon.bright || 0);
            moon.style.border = '1px solid rgba(226, 232, 240, ' +
                (0.15 + ((frame.moon.bright || 0) * 0.25)).toFixed(2) + ')';
            moon.style.filter = 'none';
        }

        if (corona) {
            var body = frame.sun.opacity >= frame.moon.opacity ? frame.sun : frame.moon;
            var coronaSize = (body.size * 2.4).toFixed(2) + 'rem';
            corona.style.transition = transition;
            corona.style.left = body.x.toFixed(2) + '%';
            corona.style.top = body.y.toFixed(2) + '%';
            corona.style.width = coronaSize;
            corona.style.height = coronaSize;
            corona.style.opacity = Math.max(frame.sun.opacity, frame.moon.opacity * 0.85).toFixed(3);
            if (frame.sun.opacity >= frame.moon.opacity) {
                corona.style.background = 'radial-gradient(circle, rgba(255, 180, 90, ' +
                    (0.35 + ((frame.sun.warmth || 0) * 0.4)).toFixed(2) +
                    ') 0%, rgba(255, 220, 150, 0.18) 42%, transparent 72%)';
            } else {
                corona.style.background = 'radial-gradient(circle, rgba(186, 210, 255, ' +
                    (0.12 + ((frame.moon.bright || 0) * 0.2)).toFixed(2) +
                    ') 0%, rgba(99, 102, 241, 0.08) 45%, transparent 72%)';
            }
        }

        welcome.style.setProperty(
            '--sun-mask',
            'radial-gradient(circle at ' + frame.sun.x.toFixed(2) + '% ' +
                frame.sun.y.toFixed(2) + '%, transparent 0 3.1rem, #000 4.6rem)'
        );

        var glowBody = frame.sun.opacity >= frame.moon.opacity ? frame.sun : frame.moon;
        welcome.style.setProperty('--glow-x', glowBody.x.toFixed(2) + '%');
        welcome.style.setProperty('--glow-y', glowBody.y.toFixed(2) + '%');
    }

    function previewSkyAt(decimalHour) {
        var welcome = document.getElementById('dashboardWelcome');
        if (!welcome) {
            return null;
        }
        var hours = Math.floor(decimalHour);
        var minutes = Math.round((decimalHour - hours) * 60);
        var fake = new Date();
        fake.setHours(hours, minutes, 0, 0);
        applyContinuousSky(fake);
        return sampleSkyFrame(decimalHour);
    }

    function updateGreeting() {
        var now = new Date();
        var greetingElement = document.getElementById('greetingMessage');

        if (greetingElement) {
            greetingElement.textContent = getGreeting(now);
        }
        applyContinuousSky(now);
    }

    // ============================================
    // Ambient sky clouds + rare shooting stars
    // ============================================
    var skyCloudTimer = null;
    var skyCloudMax = 6;
    var skyMeteorTimer = null;

    function buildRandomCloudShape() {
        var lobes = 5 + Math.floor(Math.random() * 4);
        var parts = [];
        var i;
        for (i = 0; i < lobes; i += 1) {
            var x = 10 + (Math.random() * 80);
            var y = 22 + (Math.random() * 56);
            var rx = 16 + (Math.random() * 30);
            var ry = 20 + (Math.random() * 34);
            var solid = 48 + (Math.random() * 12);
            var fade = solid + 18 + (Math.random() * 10);
            parts.push(
                'radial-gradient(ellipse ' + rx.toFixed(1) + '% ' + ry.toFixed(1) +
                '% at ' + x.toFixed(1) + '% ' + y.toFixed(1) + '%, var(--cloud-fill) 0 ' +
                solid.toFixed(0) + '%, transparent ' + fade.toFixed(0) + '%)'
            );
        }
        return parts.join(',');
    }

    function spawnSkyCloud() {
        var container = document.getElementById('welcomeSkyClouds');
        if (!container || container.children.length >= skyCloudMax) {
            return;
        }

        var cloud = document.createElement('span');
        cloud.className = 'welcome-sky-cloud';
        var width = 120 + (Math.random() * 160);
        var duration = 16 + (Math.random() * 14);
        var top = 6 + (Math.random() * 42);
        var opacity = 0.34 + (Math.random() * 0.4);
        var scale = 0.7 + (Math.random() * 0.7);
        var startOffset = Math.random() * 22;
        var aspect = 0.58 + (Math.random() * 0.32);
        var rotate = -18 + (Math.random() * 36);
        var blur = 2 + (Math.random() * 2.2);
        var puffCount = 2 + Math.floor(Math.random() * 3);
        var i;

        cloud.style.setProperty('--cloud-duration', duration.toFixed(2) + 's');
        cloud.style.setProperty('--cloud-top', top.toFixed(1) + '%');
        cloud.style.setProperty('--cloud-width', width.toFixed(0) + 'px');
        cloud.style.setProperty('--cloud-opacity', opacity.toFixed(2));
        cloud.style.setProperty('--cloud-scale', scale.toFixed(2));
        cloud.style.setProperty('--cloud-aspect', aspect.toFixed(2));
        cloud.style.setProperty('--cloud-rotate', rotate.toFixed(1) + 'deg');
        cloud.style.setProperty('--cloud-blur', blur.toFixed(1) + 'px');
        cloud.style.setProperty('--cloud-shape', buildRandomCloudShape());
        cloud.style.setProperty('--cloud-puff-a', (26 + Math.random() * 22).toFixed(0) + '%');
        cloud.style.setProperty('--cloud-puff-b', (22 + Math.random() * 20).toFixed(0) + '%');
        cloud.style.setProperty('--cloud-puff-a-x', (4 + Math.random() * 28).toFixed(0) + '%');
        cloud.style.setProperty('--cloud-puff-a-y', (8 + Math.random() * 36).toFixed(0) + '%');
        cloud.style.setProperty('--cloud-puff-b-x', (4 + Math.random() * 24).toFixed(0) + '%');
        cloud.style.setProperty('--cloud-puff-b-y', (14 + Math.random() * 40).toFixed(0) + '%');
        cloud.style.left = (-38 - startOffset) + '%';

        for (i = 0; i < puffCount; i += 1) {
            var puff = document.createElement('span');
            var puffSize = 18 + (Math.random() * 34);
            puff.className = 'welcome-sky-cloud-puff';
            puff.style.width = puffSize.toFixed(0) + '%';
            puff.style.height = (puffSize * (0.85 + Math.random() * 0.35)).toFixed(0) + '%';
            puff.style.left = (6 + Math.random() * 72).toFixed(0) + '%';
            puff.style.top = (8 + Math.random() * 62).toFixed(0) + '%';
            puff.style.opacity = (0.55 + Math.random() * 0.4).toFixed(2);
            cloud.appendChild(puff);
        }

        cloud.addEventListener('animationend', function() {
            if (cloud.parentNode) {
                cloud.parentNode.removeChild(cloud);
            }
        });

        container.appendChild(cloud);
    }

    function spawnShootingStar() {
        var welcome = document.getElementById('dashboardWelcome');
        var container = document.getElementById('welcomeSkyMeteors');
        if (!welcome || !container) {
            return;
        }
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }

        var starsOpacity = parseFloat(welcome.style.getPropertyValue('--stars-opacity')) || 0;
        if (starsOpacity < 0.35) {
            return;
        }

        // Very rare: ~8% chance each attempt (~once every few minutes).
        if (Math.random() > 0.08) {
            return;
        }

        var meteor = document.createElement('span');
        meteor.className = 'welcome-sky-meteor';
        meteor.style.left = (8 + Math.random() * 62).toFixed(1) + '%';
        meteor.style.top = (4 + Math.random() * 38).toFixed(1) + '%';
        meteor.style.setProperty('--meteor-length', (4.5 + Math.random() * 5).toFixed(1) + 'rem');
        meteor.style.setProperty('--meteor-angle', (-42 + Math.random() * 24).toFixed(1) + 'deg');
        meteor.style.setProperty('--meteor-duration', (0.65 + Math.random() * 0.45).toFixed(2) + 's');
        meteor.style.setProperty('--meteor-travel', (28 + Math.random() * 28).toFixed(0) + 'vw');
        meteor.style.setProperty('--meteor-drop', (10 + Math.random() * 18).toFixed(0) + 'vh');

        meteor.addEventListener('animationend', function() {
            if (meteor.parentNode) {
                meteor.parentNode.removeChild(meteor);
            }
        });

        container.appendChild(meteor);
    }

    function initSkyClouds() {
        var container = document.getElementById('welcomeSkyClouds');
        if (!container || skyCloudTimer) {
            return;
        }

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }

        var i;
        for (i = 0; i < 3; i += 1) {
            setTimeout(spawnSkyCloud, i * 1200);
        }

        skyCloudTimer = setInterval(spawnSkyCloud, 2800);

        if (!skyMeteorTimer) {
            skyMeteorTimer = setInterval(spawnShootingStar, 14000);
        }
    }

    // ============================================
    // Live Time and Date
    // ============================================
    function updateClock() {
        var now = new Date();
        var timeElement = document.getElementById('liveTime');
        var dateElement = document.getElementById('liveDate');

        if (timeElement) {
            var hours = String(now.getHours()).padStart(2, '0');
            var minutes = String(now.getMinutes()).padStart(2, '0');
            timeElement.textContent = hours + ':' + minutes;
            timeElement.setAttribute('datetime', now.toISOString());
        }

        if (dateElement) {
            var options = {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            };
            dateElement.textContent = now.toLocaleDateString('en-US', options);
            dateElement.setAttribute(
                'datetime',
                now.getFullYear() + '-' +
                String(now.getMonth() + 1).padStart(2, '0') + '-' +
                String(now.getDate()).padStart(2, '0')
            );
        }

        updateGreeting();

        var lastUpdated = document.getElementById('lastUpdated');
        if (lastUpdated) {
            var nowStr = now.getFullYear() + '-' +
                String(now.getMonth() + 1).padStart(2, '0') + '-' +
                String(now.getDate()).padStart(2, '0') + ' ' +
                String(now.getHours()).padStart(2, '0') + ':' +
                String(now.getMinutes()).padStart(2, '0') + ':' +
                String(now.getSeconds()).padStart(2, '0');
            lastUpdated.textContent = nowStr;
        }
    }
    
    // ============================================
    // Typewriter Effect
    // ============================================
    function typewriterEffect() {
        var element = document.getElementById('typewriterText');
        if (!element) return;
        
        var messageIndex = 0;
        var charIndex = 0;
        var isDeleting = false;
        var typingTimer = null;
        
        function type() {
            var currentMessage = typewriterMessages[messageIndex];
            
            if (isDeleting) {
                element.textContent = currentMessage.substring(0, charIndex - 1);
                charIndex--;
                
                if (charIndex === 0) {
                    isDeleting = false;
                    messageIndex = (messageIndex + 1) % typewriterMessages.length;
                    clearTimeout(typingTimer);
                    typingTimer = setTimeout(type, PAUSE_BEFORE_TYPING);
                    return;
                }
                
                typingTimer = setTimeout(type, ERASING_SPEED);
            } else {
                element.textContent = currentMessage.substring(0, charIndex + 1);
                charIndex++;
                
                if (charIndex === currentMessage.length) {
                    isDeleting = true;
                    clearTimeout(typingTimer);
                    typingTimer = setTimeout(type, PAUSE_BEFORE_ERASE);
                    return;
                }
                
                typingTimer = setTimeout(type, TYPING_SPEED);
            }
        }
        
        type();
    }
    
    // ============================================
    // Animate Stats - Counting Effect
    // ============================================
    function animateStats() {
        var statNumbers = document.querySelectorAll('.stat-number[data-count]');
        
        statNumbers.forEach(function(stat) {
            var target = parseInt(stat.getAttribute('data-count'));
            if (target === 0) {
                stat.textContent = '0';
                return;
            }
            
            var current = 0;
            var duration = 1200;
            var steps = 30;
            var increment = target / steps;
            var stepTime = duration / steps;
            
            // Reset to 0 first
            stat.textContent = '0';
            
            var timer = setInterval(function() {
                current += increment;
                if (current >= target) {
                    current = target;
                    clearInterval(timer);
                }
                stat.textContent = Math.round(current);
            }, stepTime);
        });
    }
    
    // ============================================
    // Animate Overdue Cards
    // ============================================
    function animateOverdueCards() {
        var cards = document.querySelectorAll('.overdue-card');
        cards.forEach(function(card, index) {
            var delay = (index + 1) * 100;
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            card.classList.remove('visible');
            
            setTimeout(function() {
                card.classList.add('visible');
            }, delay);
        });
    }
    
    // ============================================
    // Setup Scroll Observer for Stats
    // ============================================
    function setupScrollObserver() {
        var statsSection = document.querySelector('.dashboard-stats');
        if (!statsSection) return;
        
        if ('IntersectionObserver' in window) {
            statsObserver = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting && !isStatsAnimated) {
                        isStatsAnimated = true;
                        animateStats();
                        animateOverdueCards();
                        statsObserver.disconnect();
                    }
                });
            }, {
                threshold: 0.2,
                rootMargin: '0px 0px -50px 0px'
            });
            
            statsObserver.observe(statsSection);
        } else {
            animateStats();
            animateOverdueCards();
        }
    }
    
    // ============================================
    // Reset Stats for Re-animation
    // ============================================
    function resetStats() {
        var statNumbers = document.querySelectorAll('.stat-number[data-count]');
        statNumbers.forEach(function(stat) {
            stat.textContent = '0';
        });
        
        var cards = document.querySelectorAll('.overdue-card');
        cards.forEach(function(card) {
            card.classList.remove('visible');
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
        });
    }
    
    // ============================================
    // Refresh Dashboard Data
    // ============================================
    function refreshDashboardData() {
        // Only update the clock - NO page reload
        updateClock();
    }
    
    // ============================================
    // Async dashboard data
    // ============================================
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatActivityTime(value) {
        if (!value) {
            return '';
        }
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        var now = new Date();
        var diffMs = now - date;
        var diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) {
            return 'Just now';
        }
        if (diffMins < 60) {
            return diffMins + ' minute' + (diffMins === 1 ? '' : 's') + ' ago';
        }
        var diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) {
            return diffHours + ' hour' + (diffHours === 1 ? '' : 's') + ' ago';
        }
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    function activityKind(title) {
        var t = String(title || '').toLowerCase();
        if (t.indexOf('employee') !== -1) {
            return 'employee';
        }
        if (t.indexOf('assign') !== -1) {
            return 'assign';
        }
        if (t.indexOf('return') !== -1) {
            return 'return';
        }
        if (t.indexOf('maintenance') !== -1 || t.indexOf('service') !== -1) {
            return 'maintenance';
        }
        if (t.indexOf('deleted') !== -1 || t.indexOf('delete') !== -1) {
            return 'delete';
        }
        if (t.indexOf('password') !== -1 || t.indexOf('security') !== -1) {
            return 'security';
        }
        if (t.indexOf('issue') !== -1) {
            return 'issue';
        }
        if (t.indexOf('asset') !== -1) {
            return 'asset';
        }
        return 'default';
    }

    function activityIconClass(kind, type) {
        var byKind = {
            asset: 'fa-box',
            employee: 'fa-user',
            assign: 'fa-link',
            return: 'fa-rotate-left',
            maintenance: 'fa-wrench',
            delete: 'fa-trash',
            security: 'fa-key',
            issue: 'fa-exclamation-triangle',
            default: null
        };
        if (byKind[kind]) {
            return byKind[kind];
        }
        if (type === 'success') {
            return 'fa-check';
        }
        if (type === 'warning') {
            return 'fa-exclamation';
        }
        if (type === 'error') {
            return 'fa-times';
        }
        return 'fa-info';
    }

    function collapseActivityFeed(items) {
        var collapsed = [];
        items.forEach(function(activity) {
            var prev = collapsed[collapsed.length - 1];
            if (
                prev &&
                prev.title === activity.title &&
                prev.message === activity.message
            ) {
                prev.count = (prev.count || 1) + 1;
                return;
            }
            collapsed.push({
                id: activity.id,
                type: activity.type,
                title: activity.title,
                message: activity.message,
                time: activity.time,
                link: activity.link,
                count: 1
            });
        });
        return collapsed;
    }

    function renderActivityFeed(activities) {
        var items = collapseActivityFeed((activities || []).slice(0, 10));
        if (!items.length) {
            return '';
        }

        var eventLabel = items.length === 1 ? '1 event' : items.length + ' events';
        var list = items.map(function(activity) {
            var type = activity.type || 'info';
            var kind = activityKind(activity.title);
            var count = activity.count || 1;
            var titleHtml = activity.link
                ? '<a href="' + escapeHtml(activity.link) + '" class="activity-item-title">' + escapeHtml(activity.title) + '</a>'
                : '<span class="activity-item-title">' + escapeHtml(activity.title) + '</span>';
            var countHtml = count > 1
                ? '<span class="activity-item-count" title="' + count + ' similar events">×' + count + '</span>'
                : '';

            return '' +
                '<li class="activity-item activity-item--' + escapeHtml(type) +
                    ' activity-item--kind-' + escapeHtml(kind) + '">' +
                    '<span class="activity-item-icon activity-item-icon--' + escapeHtml(kind) +
                        ' ' + escapeHtml(type) + '" aria-hidden="true">' +
                        '<i class="fas ' + activityIconClass(kind, type) + '"></i>' +
                    '</span>' +
                    '<div class="activity-item-body">' +
                        '<div class="activity-item-top">' +
                            titleHtml +
                            countHtml +
                            '<time class="activity-item-time" datetime="' + escapeHtml(activity.time || '') + '">' +
                                escapeHtml(formatActivityTime(activity.time)) +
                            '</time>' +
                        '</div>' +
                        '<p class="activity-item-message">' + escapeHtml(activity.message) + '</p>' +
                    '</div>' +
                '</li>';
        }).join('');

        return '' +
            '<div class="activity-section">' +
                '<div class="activity-section-head">' +
                    '<h3 class="activity-section-title">Recent activity</h3>' +
                    '<span class="activity-section-meta">' + escapeHtml(eventLabel) + '</span>' +
                '</div>' +
                '<ul class="activity-feed" aria-label="Recent activity">' + list + '</ul>' +
            '</div>';
    }

    function renderOverdueClearSection() {
        return '' +
            '<div class="overdue-section overdue-clear">' +
                '<div class="overdue-header">' +
                    '<h2><i class="fas fa-check-circle overdue-clear-icon" aria-hidden="true"></i> You\'re all caught up!</h2>' +
                '</div>' +
                '<p class="overdue-clear-message">All assets serviced within 6 months</p>' +
            '</div>';
    }

    function markInsightsLoaded() {
        var mount = document.getElementById('insight-spotlight-mount');
        var skeleton = document.getElementById('insight-skeleton');
        var list = document.getElementById('insight-spotlight');

        if (mount) {
            mount.classList.remove('async-loading');
            mount.removeAttribute('aria-busy');
        }
        if (skeleton && skeleton.parentNode) {
            skeleton.parentNode.removeChild(skeleton);
        }
        if (list) {
            list.removeAttribute('hidden');
        }
    }

    function renderDashboardStats(stats) {
        var container = document.getElementById('dashboard-stats');
        if (!container || !stats || !stats.length) {
            return;
        }

        container.classList.remove('async-loading');
        container.removeAttribute('aria-busy');

        container.innerHTML = stats.map(function(stat) {
            var key = stat.css_class || 'stat';
            var labelId = key + '-label';
            var valueId = key + '-value';
            var animateAttr = stat.animate_count && stat.data_count !== undefined
                ? ' data-count="' + stat.data_count + '"'
                : '';
            return '' +
                '<li class="dashboard-stats-item">' +
                    '<a href="' + stat.link + '" class="stat-card stat-card-link ' + key + '"' +
                        ' data-stat="' + key + '"' +
                        ' data-loader="true" data-loader-message="Loading Assets..."' +
                        ' aria-labelledby="' + labelId + ' ' + valueId + '">' +
                        '<span class="stat-icon-badge" aria-hidden="true">' +
                            '<i class="fas ' + stat.icon + ' stat-icon"></i>' +
                        '</span>' +
                        '<div class="stat-card-content">' +
                            '<span class="stat-label" id="' + labelId + '">' + stat.label + '</span>' +
                            '<p class="stat-number" id="' + valueId + '"' + animateAttr + '>' + stat.value + '</p>' +
                            '<p class="stat-trend">' + stat.trend + '</p>' +
                        '</div>' +
                        '<i class="fas fa-chevron-right stat-card-chevron" aria-hidden="true"></i>' +
                    '</a>' +
                '</li>';
        }).join('');
    }

    function renderOverdueSection(data) {
        var container = document.getElementById('overdue-section-mount');
        if (!container) {
            return;
        }

        container.classList.remove('async-loading');
        container.removeAttribute('aria-busy');

        var overdueAssets = data.overdue_assets || [];
        var activityHtml = renderActivityFeed(data.recent_activities || []);
        var html = '';

        if (!overdueAssets.length) {
            html += renderOverdueClearSection();
        } else {
            var cards = overdueAssets.slice(0, 6).map(function(asset, index) {
                return '' +
                    '<div class="overdue-card" data-delay="' + (index + 1) + '">' +
                        '<div class="overdue-card-header">' +
                            '<span class="overdue-icon"></span>' +
                            '<strong>' + escapeHtml(asset.name) + '</strong>' +
                        '</div>' +
                        '<div class="overdue-card-body">' +
                            '<p><span>Type</span> ' + escapeHtml(asset.type) + '</p>' +
                            '<p><span>Serial</span> ' + escapeHtml(asset.serial_number) + '</p>' +
                            '<p><span>Status</span> <span class="badge badge-' + String(asset.status).toLowerCase().replace(/\s+/g, '') + '">' + escapeHtml(asset.status) + '</span></p>' +
                            '<p><span>Last Service</span> ' + escapeHtml(asset.last_maintenance_date || 'Never') + '</p>' +
                        '</div>' +
                        '<div class="overdue-card-footer">' +
                            '<a href="' + escapeHtml(asset.detail_url) + '" class="btn-sm"><i class="fas fa-eye"></i> View Details</a>' +
                        '</div>' +
                    '</div>';
            }).join('');

            var moreLink = overdueAssets.length > 6
                ? '<div class="overdue-more"><a href="' + escapeHtml(data.overdue_list_url || '') + '" class="btn btn-secondary"><i class="fas fa-list"></i> View All ' + overdueAssets.length + '</a></div>'
                : '';

            html += '' +
                '<div class="overdue-section">' +
                    '<div class="overdue-header">' +
                        '<h2><i class="fas fa-exclamation-triangle" style="color: var(--danger-color, #ef4444);"></i> Overdue Service</h2>' +
                        '<span class="overdue-badge">' + overdueAssets.length + '</span>' +
                    '</div>' +
                    '<p class="overdue-subtitle"><strong>' + overdueAssets.length + '</strong> asset' + (overdueAssets.length > 1 ? 's' : '') + ' overdue since ' + escapeHtml(data.overdue_cutoff || '') + '</p>' +
                    '<div class="overdue-grid">' + cards + '</div>' +
                    moreLink +
                '</div>';
        }

        html += activityHtml;
        container.innerHTML = html;

        if (overdueAssets.length) {
            animateOverdueCards();
        }
    }

    function applyDashboardData(data) {
        renderDashboardStats(data.dashboard_stats || []);
        renderOverdueSection(data);
        setGreetingActivity(data.today_activity_count, data.busy_day_threshold);
        if (window.DashboardAnalytics) {
            window.DashboardAnalytics.applyData(data);
        }
        markInsightsLoaded();
    }

    function loadAsyncDashboard() {
        var mount = document.getElementById('dashboard-stats');
        if (!mount || !window.BackgroundJobs) {
            return;
        }

        mount.classList.add('async-loading');
        var insightMount = document.getElementById('insight-spotlight-mount');
        if (insightMount) {
            insightMount.classList.add('async-loading');
        }
        var overdueMount = document.getElementById('overdue-section-mount');
        if (overdueMount) {
            overdueMount.classList.add('async-loading');
        }
        if (window.DashboardAnalytics) {
            window.DashboardAnalytics.initTabs();
            window.DashboardAnalytics.applyData(null);
        }
        window.BackgroundJobs.run('dashboard', { force: true }).then(function(job) {
            var data = job.result || {};
            mount.classList.remove('async-loading');
            applyDashboardData(data);
            isStatsAnimated = false;
            setupScrollObserver();
        }).catch(function(error) {
            mount.classList.remove('async-loading');
            var overdueMount = document.getElementById('overdue-section-mount');
            if (overdueMount) {
                overdueMount.classList.remove('async-loading');
            }
            var insightMount = document.getElementById('insight-spotlight-mount');
            if (insightMount) {
                insightMount.classList.remove('async-loading');
            }
            console.error('Dashboard async load failed:', error);
            if (window.Utils && typeof window.Utils.showAsyncError === 'function') {
                window.Utils.showAsyncError(
                    mount,
                    window.Utils.getUserFacingError(
                        error,
                        'Unable to load dashboard metrics. Refresh the page to try again.'
                    ),
                    { onRetry: loadAsyncDashboard }
                );
            }
        });
    }

    // ============================================
    // Initialize Dashboard
    // ============================================
    function init() {
        console.log('Dashboard module initializing...');
        
        updateGreeting();
        updateClock();
        initSkyClouds();
        
        // Update clock every second
        setInterval(updateClock, 1000);
        
        // Typewriter effect
        typewriterEffect();

        if (document.querySelector('.dashboard-page') && document.querySelector('.dashboard-page').dataset.asyncDashboard === 'true') {
            loadAsyncDashboard();
        } else {
            setupScrollObserver();
        }
        
        // Refresh data every minute (NO page reload)
        setInterval(refreshDashboardData, 60000);
        
        console.log('Dashboard module initialized.');
    }
    
    // ============================================
    // Export
    // ============================================
    window.Dashboard = {
        init: init,
        refresh: refreshDashboardData,
        getGreeting: getGreeting,
        setGreetingActivity: setGreetingActivity,
        animateStats: animateStats,
        resetStats: resetStats,
        previewSkyAt: previewSkyAt
    };
    
    console.log('Dashboard module loaded.');
    
})();