document.addEventListener('DOMContentLoaded', () => {
  const perfilCard = document.getElementById('perfilCard');
  const form = document.getElementById('perfilForm');
  const btnEdit = document.getElementById('btnEdit');
  const btnCancel = document.getElementById('btnCancel');
  const btnSave = document.getElementById('btnSave');
  const fotoInput = document.getElementById('fotoInput');
  const fotoLabel = document.getElementById('fotoLabel');
  const avatarPreview = document.getElementById('avatarPreview');

  const fullNameView = document.getElementById('fullNameView');
  const emailView = document.getElementById('emailView');
  const memberSince = document.getElementById('memberSince');

  const successBox = document.getElementById('perfilSuccess');
  const successText = document.getElementById('perfilSuccessText');
  const errorBox = document.getElementById('perfilError');
  const errorText = document.getElementById('perfilErrorText');

  const fields = {
    nombre: document.getElementById('nombre'),
    apellido: document.getElementById('apellido'),
    email: document.getElementById('email'),
    telefono: document.getElementById('telefono'),
    ciudad: document.getElementById('ciudad'),
    direccion: document.getElementById('direccion')
  };

  const state = {
    mode: 'view',
    loading: false,
    data: null,
    originalPhotoSrc: avatarPreview ? avatarPreview.src : '',
    selectedPhoto: null
  };

  const fieldErrors = {
    nombre: document.getElementById('nombreError'),
    apellido: document.getElementById('apellidoError'),
    email: document.getElementById('emailError'),
    telefono: document.getElementById('telefonoError')
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^[+\d\s().-]{7,20}$/;

  const hideMessages = () => {
    successBox.classList.remove('visible');
    errorBox.classList.remove('visible');
  };

  const showSuccess = (message) => {
    hideMessages();
    successText.textContent = message;
    successBox.classList.add('visible');
  };

  const showError = (message) => {
    hideMessages();
    errorText.textContent = message;
    errorBox.classList.add('visible');
  };

  const formatDate = (isoDate) => {
    if (!isoDate) return '-';
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'long'
    }).format(date);
  };

  const clearValidation = () => {
    Object.values(fields).forEach((field) => {
      field.classList.remove('is-invalid', 'is-valid');
    });
    Object.values(fieldErrors).forEach((errorEl) => {
      if (!errorEl) return;
      errorEl.classList.remove('visible');
    });
  };

  const validateField = (name) => {
    const input = fields[name];
    if (!input) return true;

    const value = input.value.trim();
    let valid = true;

    if ((name === 'nombre' || name === 'apellido') && !value) {
      valid = false;
    }

    if (name === 'email' && !emailRegex.test(value)) {
      valid = false;
    }

    if (name === 'telefono' && value && !phoneRegex.test(value)) {
      valid = false;
    }

    input.classList.toggle('is-invalid', !valid);
    input.classList.toggle('is-valid', valid && !!value);
    if (fieldErrors[name]) {
      fieldErrors[name].classList.toggle('visible', !valid);
    }

    return valid;
  };

  const validateForm = () => {
    const requiredValid = ['nombre', 'apellido', 'email'].every(validateField);
    const phoneValid = validateField('telefono');
    return requiredValid && phoneValid;
  };

  const setLoading = (isLoading) => {
    state.loading = isLoading;
    btnSave.disabled = isLoading;
    btnCancel.disabled = isLoading;
    btnEdit.disabled = isLoading;
    fotoLabel.classList.toggle('is-disabled', isLoading || state.mode === 'view');

    if (isLoading) {
      btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    } else {
      btnSave.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar cambios';
    }
  };

  const setMode = (mode) => {
    state.mode = mode;
    const isEdit = mode === 'edit';

    perfilCard.dataset.mode = mode;
    btnEdit.classList.toggle('perfil-ghost-btn--hidden', isEdit);
    btnCancel.classList.toggle('perfil-ghost-btn--hidden', !isEdit);
    btnSave.classList.toggle('perfil-save-btn--hidden', !isEdit);
    fotoLabel.classList.toggle('is-disabled', !isEdit || state.loading);

    Object.values(fields).forEach((field) => {
      field.readOnly = !isEdit;
      field.setAttribute('aria-readonly', String(!isEdit));
    });

    if (!isEdit) {
      clearValidation();
    }
  };

  const setFormData = (data) => {
    state.data = data;
    fields.nombre.value = data.nombre || '';
    fields.apellido.value = data.apellido || '';
    fields.email.value = data.email || '';
    fields.telefono.value = data.telefono || '';
    fields.ciudad.value = data.ciudad || '';
    fields.direccion.value = data.direccion || '';

    const fullName = `${data.nombre || ''} ${data.apellido || ''}`.trim();
    fullNameView.textContent = fullName || 'Usuario';
    emailView.textContent = data.email || '';
    memberSince.textContent = formatDate(data.created_at);

    if (data.foto_url) {
      avatarPreview.src = data.foto_url;
      state.originalPhotoSrc = data.foto_url;
    }
  };

  const revertToSnapshot = () => {
    if (!state.data) return;
    setFormData(state.data);
    state.selectedPhoto = null;
    fotoInput.value = '';
    avatarPreview.src = state.originalPhotoSrc || avatarPreview.src;
  };

  const loadProfile = async () => {
    hideMessages();
    try {
      const response = await fetch('/autenticacion/api/perfil', {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        throw new Error('No se pudo cargar el perfil.');
      }

      const payload = await response.json();
      if (!payload.ok) {
        throw new Error(payload.message || 'No se pudo cargar el perfil.');
      }

      setFormData(payload.data);
      setMode('view');
    } catch (error) {
      showError(error.message || 'Error de red al cargar el perfil.');
    }
  };

  fotoInput.addEventListener('change', () => {
    const file = fotoInput.files && fotoInput.files[0];
    if (!file) return;

    const maxBytes = 4 * 1024 * 1024;
    if (file.size > maxBytes) {
      fotoInput.value = '';
      showError('La imagen supera el tamano maximo permitido (4 MB).');
      return;
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      fotoInput.value = '';
      showError('Formato de imagen no valido. Usa PNG, JPG o WEBP.');
      return;
    }

    state.selectedPhoto = file;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target && event.target.result) {
        avatarPreview.src = event.target.result;
      }
    };
    reader.readAsDataURL(file);
  });

  Object.keys(fields).forEach((name) => {
    fields[name].addEventListener('blur', () => {
      if (state.mode !== 'edit') return;
      validateField(name);
    });
  });

  btnEdit.addEventListener('click', () => {
    hideMessages();
    setMode('edit');
  });

  btnCancel.addEventListener('click', () => {
    hideMessages();
    revertToSnapshot();
    setMode('view');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessages();

    if (!validateForm()) {
      showError('Corrige los campos marcados para continuar.');
      return;
    }

    const body = new FormData();
    body.append('nombre', fields.nombre.value.trim());
    body.append('apellido', fields.apellido.value.trim());
    body.append('email', fields.email.value.trim());
    body.append('telefono', fields.telefono.value.trim());
    body.append('ciudad', fields.ciudad.value.trim());
    body.append('direccion', fields.direccion.value.trim());

    if (state.selectedPhoto) {
      body.append('foto', state.selectedPhoto);
    }

    setLoading(true);

    try {
      const response = await fetch('/autenticacion/api/perfil', {
        method: 'POST',
        body
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || 'No se pudo actualizar tu perfil.');
      }

      setFormData({
        ...state.data,
        ...payload.data
      });
      state.selectedPhoto = null;
      fotoInput.value = '';
      state.originalPhotoSrc = payload.data.foto_url || state.originalPhotoSrc;

      setMode('view');
      showSuccess(payload.message || 'Perfil actualizado correctamente.');
    } catch (error) {
      showError(error.message || 'Error de red al guardar el perfil.');
    } finally {
      setLoading(false);
    }
  });

  loadProfile();
});
