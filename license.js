const LicenseManager = (() => {
    const LICENSE_KEY = 'cts_license_key';
    const LICENSE_VALIDATED_AT = 'cts_license_validated_at';
    const LICENSE_INSTANCE_ID = 'cts_license_instance_id';
    const LICENSE_INSTANCE_NAME = 'cts_license_instance_name';
    const REVALIDATE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
    const LS_API_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';
    const DEV_KEY = 'TEST-TEST-TEST-TEST';
    const VALID_PRODUCT_IDS = ['1166862', '1166895', '1166899', '1166902'];

    let overlay = null;
    let errorEl = null;
    let inputEl = null;
    let spinnerEl = null;
    let activateBtnEl = null;
    let deviceNameModal = null;
    let manageDevicesModal = null;

    let pendingKey = null;

    function init() {
        createOverlay();
        createDeviceNameModal();
        createManageDevicesModal();
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
                <div id="license-manage-link" style="display:none;">
                    <button class="license-retry" id="license-manage-btn">Manage Devices</button>
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

        overlay.querySelector('#license-manage-btn').addEventListener('click', showManageDevices);
    }

    function createDeviceNameModal() {
        deviceNameModal = document.createElement('div');
        deviceNameModal.className = 'license-overlay';
        deviceNameModal.style.display = 'none';
        const defaultName = `${navigator.platform} — ${new Date().toLocaleDateString()}`;
        deviceNameModal.innerHTML = `
            <div class="license-overlay-content">
                <h2>Name This Device</h2>
                <p>Give this device a name so you can identify it later.</p>
                <div class="license-input-group">
                    <input type="text" id="device-name-input" placeholder="${defaultName}" maxlength="50">
                    <button id="device-name-submit" class="btn primary">Continue</button>
                </div>
                <div class="license-error" id="device-name-error"></div>
            </div>
        `;
        document.getElementById('app').before(deviceNameModal);

        const submitBtn = deviceNameModal.querySelector('#device-name-submit');
        const nameInput = deviceNameModal.querySelector('#device-name-input');

        submitBtn.addEventListener('click', () => {
            const name = nameInput.value.trim() || defaultName;
            completeActivation(pendingKey, name);
        });
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitBtn.click();
        });
    }

    function createManageDevicesModal() {
        manageDevicesModal = document.createElement('div');
        manageDevicesModal.className = 'license-overlay';
        manageDevicesModal.style.display = 'none';
        manageDevicesModal.innerHTML = `
            <div class="license-overlay-content">
                <h2>Manage Devices</h2>
                <p>Current device: <strong id="manage-current-device"></strong></p>
                <div id="manage-device-error" class="license-error"></div>
                <button id="manage-deactivate-btn" class="btn primary">Deactivate This Device</button>
                <button id="manage-close-btn" class="btn secondary" style="margin-left:0.5rem;">Close</button>
                <p style="margin-top:1rem;font-size:0.8rem;color:var(--cts-text-muted);">
                    Note: Only this browser's activation can be deactivated here.
                    Other devices must be deactivated from their own browsers.
                </p>
            </div>
        `;
        document.getElementById('app').before(manageDevicesModal);

        manageDevicesModal.querySelector('#manage-close-btn').addEventListener('click', hideManageDevices);
        manageDevicesModal.querySelector('#manage-deactivate-btn').addEventListener('click', deactivateCurrentDevice);
    }

    function showManageDevices() {
        const instanceName = localStorage.getItem(LICENSE_INSTANCE_NAME);
        manageDevicesModal.querySelector('#manage-current-device').textContent = instanceName || 'Unknown';
        manageDevicesModal.querySelector('#manage-device-error').textContent = '';
        manageDevicesModal.style.display = 'flex';
    }

    function hideManageDevices() {
        manageDevicesModal.style.display = 'none';
    }

    async function deactivateCurrentDevice() {
        const key = localStorage.getItem(LICENSE_KEY);
        const instanceId = localStorage.getItem(LICENSE_INSTANCE_ID);
        const errorEl = manageDevicesModal.querySelector('#manage-device-error');

        if (!key || !instanceId) {
            errorEl.textContent = 'No active device found.';
            return;
        }

        try {
            const response = await fetch('/.netlify/functions/deactivate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ license_key: key, instance_id: parseInt(instanceId) }),
            });
            const data = await response.json();

            if (data.deactivated) {
                localStorage.removeItem(LICENSE_KEY);
                localStorage.removeItem(LICENSE_VALIDATED_AT);
                localStorage.removeItem(LICENSE_INSTANCE_ID);
                localStorage.removeItem(LICENSE_INSTANCE_NAME);
                hideManageDevices();
                showOverlay('Device deactivated. Please enter your license key again.');
            } else {
                errorEl.textContent = data.error || 'Failed to deactivate device.';
            }
        } catch (e) {
            errorEl.textContent = 'Could not deactivate. Check your connection.';
        }
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
            ensureActivated(storedKey);
        }
    }

    async function ensureActivated(key) {
        if (key === DEV_KEY) {
            hideOverlay();
            return;
        }

        const instanceId = localStorage.getItem(LICENSE_INSTANCE_ID);
        if (!instanceId) {
            pendingKey = key;
            showDeviceNameModal();
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
        overlay.querySelector('#license-manage-link').style.display = 'none';
    }

    function showManageDevicesLink() {
        overlay.querySelector('#license-manage-link').style.display = 'block';
    }

    function hideOverlay() {
        if (overlay) overlay.style.display = 'none';
    }

    function setLoading(loading) {
        activateBtnEl.style.display = loading ? 'none' : '';
        spinnerEl.style.display = loading ? '' : 'none';
    }

    function showError(msg, showManageLink) {
        errorEl.textContent = msg;
        setLoading(false);
        if (showManageLink) showManageDevicesLink();
    }

    function showDeviceNameModal() {
        const nameInput = deviceNameModal.querySelector('#device-name-input');
        nameInput.value = '';
        deviceNameModal.querySelector('#device-name-error').textContent = '';
        deviceNameModal.style.display = 'flex';
        nameInput.focus();
    }

    function hideDeviceNameModal() {
        deviceNameModal.style.display = 'none';
    }

    async function validateAndActivate(key) {
        if (!key || key.replace(/-/g, '').length !== 16) {
            showError('Please enter a valid license key (XXXX-XXXX-XXXX-XXXX).');
            return;
        }

        if (key === DEV_KEY) {
            localStorage.setItem(LICENSE_KEY, key);
            localStorage.setItem(LICENSE_VALIDATED_AT, Date.now().toString());
            localStorage.setItem(LICENSE_INSTANCE_ID, 'dev');
            localStorage.setItem(LICENSE_INSTANCE_NAME, 'Dev Device');
            hideOverlay();
            return;
        }

        setLoading(true);
        errorEl.textContent = '';

        try {
            const result = await callLicenseAPI(key);
            if (result.valid) {
                pendingKey = key;
                setLoading(false);
                showDeviceNameModal();
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

    async function completeActivation(key, deviceName) {
        hideDeviceNameModal();
        setLoading(true);

        try {
            const response = await fetch('/.netlify/functions/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ license_key: key, instance_name: deviceName }),
            });
            const data = await response.json();

            if (data.activated) {
                localStorage.setItem(LICENSE_KEY, key);
                localStorage.setItem(LICENSE_VALIDATED_AT, Date.now().toString());
                localStorage.setItem(LICENSE_INSTANCE_ID, data.instance?.id?.toString());
                localStorage.setItem(LICENSE_INSTANCE_NAME, deviceName);
                setLoading(false);
                hideOverlay();
            } else {
                setLoading(false);
                const limitReached = data.meta?.license_key?.activation_usage >= data.meta?.license_key?.activation_limit;
                if (limitReached) {
                    const usage = data.meta?.license_key?.activation_usage;
                    const limit = data.meta?.license_key?.activation_limit;
                    showError(`This license has reached its maximum device limit (${usage}/${limit}). Deactivate a device to continue.`, true);
                } else {
                    showError(data.error || 'Activation failed. Please try again.');
                }
            }
        } catch (e) {
            setLoading(false);
            showError('Could not activate. Check your connection.');
        }
    }

    async function validateSilently(key) {
        if (key === DEV_KEY) {
            localStorage.setItem(LICENSE_VALIDATED_AT, Date.now().toString());
            hideOverlay();
            return;
        }

        try {
            const result = await callLicenseAPI(key);
            if (result.valid) {
                localStorage.setItem(LICENSE_VALIDATED_AT, Date.now().toString());
                ensureActivated(key);
            } else {
                localStorage.removeItem(LICENSE_KEY);
                localStorage.removeItem(LICENSE_VALIDATED_AT);
                localStorage.removeItem(LICENSE_INSTANCE_ID);
                localStorage.removeItem(LICENSE_INSTANCE_NAME);
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
        const productId = data.meta?.product_id?.toString();
        const isValidProduct = VALID_PRODUCT_IDS.includes(productId);
        return {
            valid: data.valid === true && isValidProduct,
            error: data.valid && !isValidProduct
                ? 'This license key is not valid for this product.'
                : (data.error || (data.valid === false ? 'Invalid license key.' : null)),
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
