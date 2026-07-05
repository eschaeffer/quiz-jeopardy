window.MathJaxLoader = (() => {
    let loadPromise = null;

    function configureMathJax() {
        window.MathJax = {
            tex: {
                inlineMath: [['\\(', '\\)']],
                displayMath: [['\\[', '\\]']]
            },
            options: {
                skipHtmlTags: ['script', 'noscript', 'style', 'textarea']
            }
        };
    }

    function ensureLoaded() {
        if (window.MathJax?.typesetPromise) return Promise.resolve(window.MathJax);
        if (loadPromise) return loadPromise;

        configureMathJax();
        loadPromise = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
            script.defer = true;
            script.onload = () => resolve(window.MathJax);
            script.onerror = () => {
                console.warn('MathJax failed to load from CDN. Continuing without rendered math.');
                loadPromise = null;
                resolve(null);
            };
            document.head.appendChild(script);
        });

        return loadPromise;
    }

    function typeset(targets) {
        if (!window.MathJax?.typesetPromise) return Promise.resolve();

        const items = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
        if (items.length === 0) return Promise.resolve();

        if (window.MathJax.typesetClear) {
            window.MathJax.typesetClear(items);
        }

        return window.MathJax.typesetPromise(items).catch((err) => {
            console.warn(err);
        });
    }

    function maybeTypeset(shouldLoad, targets) {
        if (!shouldLoad) return Promise.resolve();
        return ensureLoaded().then(() => typeset(targets));
    }

    return {
        ensureLoaded,
        typeset,
        maybeTypeset
    };
})();
