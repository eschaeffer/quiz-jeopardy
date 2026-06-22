const LicenseManager = (() => {
    const LICENSE_KEY = 'cts_license_key';
    const LICENSE_VALIDATED_AT = 'cts_license_validated_at';
    const REVALIDATE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
    const LS_API_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';

    let overlay = null;
    let errorEl = null;
    let inputEl = null;
    let spinnerEl = null;
    let activateBtnEl = null;

    function init() {
        createOverlay();
        checkLicense();
    }

    function createOverlay() {
        if (overlay) return;

        overlay = document.createElement('div');
        overlay.className = 'license-overlay';
        overlay.innerHTML = `
            <div class="license-overlay-content">
                <h2>Activate Classroom Trivia Showdown</h2>
                <p>Enter your license key to continue.</p>
                <div class="license-input-group">
                    <input type="text" id="license-input" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="19" autocomplete="off">
                    <button id="license-activate-btn" class="btn primary">Activate</button>
                </div>
                <div class="license-error" id="license-error"></div>
                <div id="license-spinner" style="display:none;">
                    <span class="license-spinner"></span> Validating...
                </div>
                <a href="terms.html" class="license-terms-link">View License Terms</a>
            </div>
        `;
        document.getElementById('app').before(overlay);

        errorEl = overlay.querySelector('#license-error');
        inputEl = overlay.querySelector('#license-input');
        spinnerEl = overlay.querySelector('#license-spinner');
        activateBtnEl = overlay.querySelector('#license-activate-btn');

        activateBtnEl.addEventListener('click', () => validateAndActivate(inputEl.value.trim()));
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') validateAndActivate(inputEl.value.trim());
        });

        inputEl.addEventListener('input', (e) => {
            let v = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            let formatted = '';
            for (let i = 0; i < v.length && i < 16; i++) {
                if (i > 0 && i % 4 === 0) formatted += '-';
                formatted += v[i];
            }
            e.target.value = formatted;
        });
    }

    function checkLicense() {
        const storedKey = localStorage.getItem(LICENSE_KEY);
        const validatedAt = localStorage.getItem(LICENSE_VALIDATED_AT);

        if (!storedKey) {
            showOverlay();
            return;
        }

        const needsRevalidate = !validatedAt || (Date.now() - parseInt(validatedAt)) > REVALIDATE_INTERVAL_MS;

        if (needsRevalidate) {
            validateSilently(storedKey);
        } else {
            hideOverlay();
        }
    }

    function showOverlay(message) {
        if (!overlay) createOverlay();
        overlay.style.display = 'flex';
        if (message) {
            errorEl.textContent = message;
        } else {
            errorEl.textContent = '';
        }
        inputEl.value = '';
        inputEl.focus();
    }

    function hideOverlay() {
        if (overlay) overlay.style.display = 'none';
    }

    function setLoading(loading) {
        activateBtnEl.style.display = loading ? 'none' : '';
        spinnerEl.style.display = loading ? '' : 'none';
    }

    function showError(msg) {
        errorEl.textContent = msg;
        setLoading(false);
    }

    async function validateAndActivate(key) {
        if (!key || key.replace(/-/g, '').length !== 16) {
            showError('Please enter a valid license key (XXXX-XXXX-XXXX-XXXX).');
            return;
        }

        setLoading(true);
        errorEl.textContent = '';

        try {
            const result = await callLicenseAPI(key);
            if (result.valid) {
                localStorage.setItem(LICENSE_KEY, key);
                localStorage.setItem(LICENSE_VALIDATED_AT, Date.now().toString());
                hideOverlay();
            } else {
                showError(result.error || 'Invalid license key. Please check and try again.');
            }
        } catch (e) {
            showError('Could not validate license. Check your connection.');
            const retryBtn = document.createElement('button');
            retryBtn.className = 'license-retry';
            retryBtn.textContent = 'Retry';
            retryBtn.addEventListener('click', () => validateAndActivate(key));
            errorEl.appendChild(retryBtn);
        }
    }

    async function validateSilently(key) {
        try {
            const result = await callLicenseAPI(key);
            if (result.valid) {
                localStorage.setItem(LICENSE_VALIDATED_AT, Date.now().toString());
                hideOverlay();
            } else {
                localStorage.removeItem(LICENSE_KEY);
                localStorage.removeItem(LICENSE_VALIDATED_AT);
                showOverlay('Your license key is no longer valid. Please re-enter your key.');
            }
        } catch (e) {
            showOverlay('Could not validate license. Check your connection.');
        }
    }

    async function callLicenseAPI(key) {
        const response = await fetch(LS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ license_key: key }),
        });
        const data = await response.json();
        return {
            valid: data.valid === true,
            error: data.error || (data.valid === false ? 'Invalid license key.' : null),
        };
    }

    function getKey() {
        return localStorage.getItem(LICENSE_KEY);
    }

    function isValidated() {
        return !!localStorage.getItem(LICENSE_KEY);
    }

    return {
        init,
        getKey,
        isValidated,
    };
})();
