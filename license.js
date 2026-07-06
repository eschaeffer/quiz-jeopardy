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

    function getManageableLicenseKey() {
        return localStorage.getItem(LICENSE_KEY) || pendingKey || inputEl?.value?.trim() || null;
    }

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
                    <input type="text" id="license-input" placeholder="Enter license key" maxlength="64" autocomplete="off">
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
            e.target.value = e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase().slice(0, 64);
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
                <p>Active devices on this license:</p>
                <div id="manage-activations-list" class="license-activations-list"></div>
                <div id="manage-device-error" class="license-error"></div>
                <button id="manage-close-btn" class="btn secondary">Close</button>
                <p style="margin-top:1rem;font-size:0.8rem;color:var(--cts-text-muted);">
                    You can deactivate old devices here to free an activation slot.
                </p>
            </div>
        `;
        document.getElementById('app').before(manageDevicesModal);

        manageDevicesModal.querySelector('#manage-close-btn').addEventListener('click', hideManageDevices);
    }

    async function showManageDevices() {
        manageDevicesModal.querySelector('#manage-device-error').textContent = '';
        manageDevicesModal.style.display = 'flex';
        await loadActivations();
    }

    function hideManageDevices() {
        manageDevicesModal.style.display = 'none';
    }

    function formatActivationDate(value) {
        if (!value) return 'Unknown';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
    }

    async function loadActivations() {
        const key = getManageableLicenseKey();
        const errorEl = manageDevicesModal.querySelector('#manage-device-error');
        const listEl = manageDevicesModal.querySelector('#manage-activations-list');

        if (!key) {
            errorEl.textContent = 'No active license key found.';
            return;
        }

        listEl.innerHTML = '<div class="ai-modal-help">Loading devices...</div>';

        try {
            const response = await fetch('/.netlify/functions/list-activations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ license_key: key }),
            });
            const data = await response.json();

            if (!response.ok) {
                errorEl.textContent = data.error || 'Could not load devices.';
                listEl.innerHTML = '';
                return;
            }

            const currentInstanceId = localStorage.getItem(LICENSE_INSTANCE_ID);
            const activations = Array.isArray(data.activations) ? data.activations : [];
            if (activations.length === 0) {
                listEl.innerHTML = '<div class="ai-modal-help">No activation records found.</div>';
                return;
            }

            listEl.innerHTML = activations.map((activation) => {
                const isCurrent = String(activation.instance_id) === String(currentInstanceId);
                const canDeactivate = activation.status === 'active';
                return `
                    <div class="license-activation-item">
                        <div class="license-activation-main">
                            <div class="license-activation-name">${activation.instance_name}${isCurrent ? ' (This Device)' : ''}</div>
                            <div class="license-activation-meta">Status: ${activation.status} | Activated: ${formatActivationDate(activation.activated_at)} | Last seen: ${formatActivationDate(activation.last_seen_at)}</div>
                        </div>
                        ${canDeactivate ? `<button class="btn secondary license-activation-deactivate" data-instance-id="${activation.instance_id}">Deactivate</button>` : '<span class="ai-modal-help">Deactivated</span>'}
                    </div>
                `;
            }).join('');

            listEl.querySelectorAll('.license-activation-deactivate').forEach((button) => {
                button.addEventListener('click', async () => {
                    await deactivateActivation(button.getAttribute('data-instance-id'));
                });
            });
        } catch (e) {
            errorEl.textContent = 'Could not load devices. Check your connection.';
            listEl.innerHTML = '';
        }
    }

    async function deactivateActivation(instanceId) {
        const key = getManageableLicenseKey();
        const currentInstanceId = localStorage.getItem(LICENSE_INSTANCE_ID);
        const errorEl = manageDevicesModal.querySelector('#manage-device-error');

        if (!key || !instanceId) {
            errorEl.textContent = 'No active device found.';
            return;
        }

        try {
            const response = await fetch('/.netlify/functions/deactivate-activation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ license_key: key, instance_id: instanceId }),
            });
            const data = await response.json();

            if (data.deactivated) {
                if (String(instanceId) === String(currentInstanceId)) {
                    localStorage.removeItem(LICENSE_KEY);
                    localStorage.removeItem(LICENSE_VALIDATED_AT);
                    localStorage.removeItem(LICENSE_INSTANCE_ID);
                    localStorage.removeItem(LICENSE_INSTANCE_NAME);
                    hideManageDevices();
                    showOverlay('Device deactivated. Please enter your license key again.');
                    return;
                }

                await loadActivations();
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
        const normalizedKey = String(key || '').trim().toUpperCase();
        if (!/^[A-Z0-9-]{16,64}$/.test(normalizedKey)) {
            showError('Please enter a valid license key.');
            return;
        }

        if (normalizedKey === DEV_KEY) {
            localStorage.setItem(LICENSE_KEY, normalizedKey);
            localStorage.setItem(LICENSE_VALIDATED_AT, Date.now().toString());
            localStorage.setItem(LICENSE_INSTANCE_ID, 'dev');
            localStorage.setItem(LICENSE_INSTANCE_NAME, 'Dev Device');
            hideOverlay();
            return;
        }

        setLoading(true);
        errorEl.textContent = '';

        try {
            const result = await callLicenseAPI(normalizedKey);
            if (result.valid) {
                pendingKey = normalizedKey;
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
            retryBtn.addEventListener('click', () => validateAndActivate(normalizedKey));
            errorEl.appendChild(retryBtn);
        }
    }

    async function completeActivation(key, deviceName) {
        hideDeviceNameModal();
        setLoading(true);
        pendingKey = key;

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
                pendingKey = null;
                hideOverlay();
            } else {
                setLoading(false);
                const limitReached = data.meta?.license_key?.activation_usage >= data.meta?.license_key?.activation_limit;
                const rawLimitReached = typeof data.error === 'string' && /activation limit/i.test(data.error);
                if (limitReached || rawLimitReached) {
                    const usage = data.meta?.license_key?.activation_usage;
                    const limit = data.meta?.license_key?.activation_limit;
                    const message = (usage && limit)
                        ? `This license has reached its maximum device limit (${usage}/${limit}). Deactivate a device to continue.`
                        : 'This license key has reached the activation limit. Deactivate an old device to continue.';
                    showError(message, true);
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
                touchCurrentActivation();
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

    async function touchCurrentActivation() {
        const licenseKey = localStorage.getItem(LICENSE_KEY);
        const instanceId = localStorage.getItem(LICENSE_INSTANCE_ID);
        if (!licenseKey || !instanceId || instanceId === 'dev') {
            return;
        }

        try {
            await fetch('/.netlify/functions/touch-activation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ license_key: licenseKey, instance_id: instanceId }),
            });
        } catch (e) {
            // Best-effort only.
        }
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
