// ============================================
// AUTHENTICATION MODULE
// ============================================

const Auth = {
    currentUser: null,
    users: [],
    isLoggedIn: false,

    init() {
        this.loadUsers();
        
        const session = localStorage.getItem('auth_session');
        if (session) {
            try {
                const user = JSON.parse(session);
                this.currentUser = user;
                this.isLoggedIn = true;
                return true;
            } catch (e) {
                localStorage.removeItem('auth_session');
                return false;
            }
        }
        return false;
    },

    loadUsers() {
        try {
            const stored = localStorage.getItem('shopping_users');
            if (stored) {
                const data = JSON.parse(stored);
                this.users = data.users || [];
            } else {
                this.createDefaultUsers();
            }
            
            if (this.users.length === 0) {
                this.createDefaultUsers();
            }
        } catch (error) {
            console.error('Error loading users:', error);
            this.createDefaultUsers();
        }
    },

    createDefaultUsers() {
        this.users = [
            {
                id: 1,
                username: 'admin',
                password: this.hashPassword('admin123'),
                fullname: 'Administrator',
                created_at: new Date().toISOString()
            }
        ];
        this.saveUsers();
    },

    saveUsers() {
        try {
            localStorage.setItem('shopping_users', JSON.stringify({ users: this.users }));
            console.log('Users saved:', this.users.length);
        } catch (e) {
            console.error('Error saving users:', e);
        }
    },

    hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'hashed_' + hash.toString(36);
    },

    verifyPassword(password, hash) {
        return this.hashPassword(password) === hash;
    },

    async login(username, password) {
        this.loadUsers();
        
        const user = this.users.find(u => 
            u.username.toLowerCase() === username.toLowerCase()
        );

        if (!user) {
            return { success: false, message: 'Invalid username or password' };
        }

        if (!this.verifyPassword(password, user.password)) {
            return { success: false, message: 'Invalid username or password' };
        }

        this.currentUser = {
            id: user.id,
            username: user.username,
            fullname: user.fullname || user.username
        };
        this.isLoggedIn = true;

        localStorage.setItem('auth_session', JSON.stringify(this.currentUser));
        
        return { success: true, user: this.currentUser };
    },

    async register(username, password, fullname) {
        this.loadUsers();

        if (this.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return { success: false, message: 'Username already exists' };
        }

        if (password.length < 6) {
            return { success: false, message: 'Password must be at least 6 characters' };
        }

        const newUser = {
            id: this.users.length + 1,
            username: username,
            password: this.hashPassword(password),
            fullname: fullname || username,
            created_at: new Date().toISOString()
        };

        this.users.push(newUser);
        this.saveUsers();

        return { success: true, user: newUser };
    },

    logout() {
        this.currentUser = null;
        this.isLoggedIn = false;
        localStorage.removeItem('auth_session');
    },

    getCurrentUser() {
        return this.currentUser;
    },

    checkAuth() {
        return this.isLoggedIn;
    }
};

// ============================================
// LOGIN PAGE LOGIC
// ============================================

async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('error-message');
    const successEl = document.getElementById('success-message');
    const loginBtn = document.getElementById('login-btn');
    const spinner = document.getElementById('loading-spinner');

    errorEl.classList.remove('show');
    successEl.classList.remove('show');

    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    loginBtn.disabled = true;
    spinner.classList.add('show');

    try {
        const result = await Auth.login(username, password);
        
        if (result.success) {
            showSuccess('Login successful! Redirecting...');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } else {
            showError(result.message);
        }
    } catch (error) {
        showError('An error occurred. Please try again.');
        console.error('Login error:', error);
    } finally {
        loginBtn.disabled = false;
        spinner.classList.remove('show');
    }
}

// ============================================
// REGISTER PAGE LOGIC
// ============================================

async function handleRegister(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const fullname = document.getElementById('fullname').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorEl = document.getElementById('error-message');
    const successEl = document.getElementById('success-message');
    const registerBtn = document.getElementById('register-btn');
    const spinner = document.getElementById('loading-spinner');

    errorEl.classList.remove('show');
    successEl.classList.remove('show');

    if (!username || !password || !confirmPassword) {
        showError('All fields are required');
        return;
    }

    if (username.length < 3) {
        showError('Username must be at least 3 characters');
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters');
        return;
    }

    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }

    registerBtn.disabled = true;
    spinner.classList.add('show');

    try {
        const result = await Auth.register(username, password, fullname);
        
        if (result.success) {
            showSuccess('Account created successfully! Redirecting to login...');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        } else {
            showError(result.message);
        }
    } catch (error) {
        showError('An error occurred. Please try again.');
        console.error('Register error:', error);
    } finally {
        registerBtn.disabled = false;
        spinner.classList.remove('show');
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showError(message) {
    const errorEl = document.getElementById('error-message');
    if (errorEl) {
        errorEl.textContent = '❌ ' + message;
        errorEl.classList.add('show');
    }
}

function showSuccess(message) {
    const successEl = document.getElementById('success-message');
    if (successEl) {
        successEl.textContent = '✅ ' + message;
        successEl.classList.add('show');
    }
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId || 'password');
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }
}

function checkPasswordStrength(password) {
    let strength = 0;
    const requirements = {
        length: password.length >= 6,
        hasLower: /[a-z]/.test(password),
        hasUpper: /[A-Z]/.test(password),
        hasNumber: /[0-9]/.test(password),
        hasSpecial: /[^a-zA-Z0-9]/.test(password)
    };

    if (requirements.length) strength++;
    if (requirements.hasLower) strength++;
    if (requirements.hasUpper) strength++;
    if (requirements.hasNumber) strength++;
    if (requirements.hasSpecial) strength++;

    const strengthEl = document.getElementById('password-strength');
    if (strengthEl) {
        strengthEl.className = 'password-strength';
        if (strength <= 1) strengthEl.classList.add('weak');
        else if (strength <= 2) strengthEl.classList.add('medium');
        else if (strength <= 3) strengthEl.classList.add('strong');
        else strengthEl.classList.add('very-strong');
    }

    const reqLength = document.getElementById('req-length');
    if (reqLength) {
        reqLength.className = requirements.length ? 'valid' : 'invalid';
        reqLength.textContent = requirements.length ? '✅ At least 6 characters' : '❌ At least 6 characters';
    }

    return { strength, requirements };
}

function checkPasswordMatch() {
    const password = document.getElementById('password');
    const confirm = document.getElementById('confirm-password');
    const matchEl = document.getElementById('password-match');

    if (!password || !confirm || !matchEl) return;

    if (confirm.value.length === 0) {
        matchEl.textContent = '';
        matchEl.className = 'password-match';
        return;
    }

    if (password.value === confirm.value) {
        matchEl.textContent = '✅ Passwords match';
        matchEl.className = 'password-match match';
    } else {
        matchEl.textContent = '❌ Passwords do not match';
        matchEl.className = 'password-match no-match';
    }
}

// ============================================
// LANGUAGE SUPPORT FOR LOGIN/REGISTER
// ============================================

const authTranslations = {
    en: {
        title: 'Shirazy Shopping Center',
        welcome_login: 'Welcome back! Please login to continue',
        welcome_register: 'Create your account to get started',
        username: '👤 Username',
        password: '🔒 Password',
        confirm: '✓ Confirm Password',
        fullname: '👤 Full Name',
        login: '🔐 Login',
        register: '📝 Create Account',
        no_account: 'Don\'t have an account?',
        have_account: 'Already have an account?',
        register_here: 'Register here',
        login_here: 'Login here',
        demo: 'Demo: admin / admin123',
        username_placeholder: 'Enter your username',
        password_placeholder: 'Enter your password',
        confirm_placeholder: 'Confirm your password',
        username_hint: 'Minimum 3 characters',
        password_hint: 'Minimum 6 characters',
        login_success: 'Login successful! Redirecting...',
        register_success: 'Account created successfully! Redirecting to login...',
        login_error: 'Invalid username or password',
        username_exists: 'Username already exists',
        password_short: 'Password must be at least 6 characters',
        passwords_match: 'Passwords match',
        passwords_no_match: 'Passwords do not match',
        all_fields: 'All fields are required',
        username_short: 'Username must be at least 3 characters',
        error_occurred: 'An error occurred. Please try again.'
    },
    ar: {
        title: 'مركز الشيرازي للتسوق',
        welcome_login: 'مرحباً بعودتك! الرجاء تسجيل الدخول للمتابعة',
        welcome_register: 'أنشئ حسابك للبدء',
        username: '👤 اسم المستخدم',
        password: '🔒 كلمة المرور',
        confirm: '✓ تأكيد كلمة المرور',
        fullname: '👤 الاسم الكامل',
        login: '🔐 تسجيل الدخول',
        register: '📝 إنشاء حساب',
        no_account: 'ليس لديك حساب؟',
        have_account: 'لديك حساب بالفعل؟',
        register_here: 'سجل هنا',
        login_here: 'تسجيل الدخول هنا',
        demo: 'تجريبي: admin / admin123',
        username_placeholder: 'أدخل اسم المستخدم',
        password_placeholder: 'أدخل كلمة المرور',
        confirm_placeholder: 'تأكيد كلمة المرور',
        username_hint: 'الحد الأدنى 3 أحرف',
        password_hint: 'الحد الأدنى 6 أحرف',
        login_success: 'تم تسجيل الدخول بنجاح! جاري التحويل...',
        register_success: 'تم إنشاء الحساب بنجاح! جاري التحويل إلى تسجيل الدخول...',
        login_error: 'اسم المستخدم أو كلمة المرور غير صحيحة',
        username_exists: 'اسم المستخدم موجود بالفعل',
        password_short: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
        passwords_match: 'كلمات المرور متطابقة',
        passwords_no_match: 'كلمات المرور غير متطابقة',
        all_fields: 'جميع الحقول مطلوبة',
        username_short: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل',
        error_occurred: 'حدث خطأ. الرجاء المحاولة مرة أخرى.'
    },
    fr: {
        title: 'Centre Commercial Shirazy',
        welcome_login: 'Bon retour ! Veuillez vous connecter pour continuer',
        welcome_register: 'Créez votre compte pour commencer',
        username: '👤 Nom d\'utilisateur',
        password: '🔒 Mot de passe',
        confirm: '✓ Confirmer le mot de passe',
        fullname: '👤 Nom complet',
        login: '🔐 Connexion',
        register: '📝 Créer un compte',
        no_account: 'Vous n\'avez pas de compte ?',
        have_account: 'Vous avez déjà un compte ?',
        register_here: 'Inscrivez-vous ici',
        login_here: 'Connectez-vous ici',
        demo: 'Démo: admin / admin123',
        username_placeholder: 'Entrez votre nom d\'utilisateur',
        password_placeholder: 'Entrez votre mot de passe',
        confirm_placeholder: 'Confirmez votre mot de passe',
        username_hint: 'Minimum 3 caractères',
        password_hint: 'Minimum 6 caractères',
        login_success: 'Connexion réussie ! Redirection...',
        register_success: 'Compte créé avec succès ! Redirection vers la connexion...',
        login_error: 'Nom d\'utilisateur ou mot de passe incorrect',
        username_exists: 'Ce nom d\'utilisateur existe déjà',
        password_short: 'Le mot de passe doit comporter au moins 6 caractères',
        passwords_match: 'Les mots de passe correspondent',
        passwords_no_match: 'Les mots de passe ne correspondent pas',
        all_fields: 'Tous les champs sont requis',
        username_short: 'Le nom d\'utilisateur doit comporter au moins 3 caractères',
        error_occurred: 'Une erreur est survenue. Veuillez réessayer.'
    },
    es: {
        title: 'Centro Comercial Shirazy',
        welcome_login: '¡Bienvenido de nuevo! Inicia sesión para continuar',
        welcome_register: 'Crea tu cuenta para comenzar',
        username: '👤 Usuario',
        password: '🔒 Contraseña',
        confirm: '✓ Confirmar Contraseña',
        fullname: '👤 Nombre completo',
        login: '🔐 Iniciar Sesión',
        register: '📝 Crear Cuenta',
        no_account: '¿No tienes una cuenta?',
        have_account: '¿Ya tienes una cuenta?',
        register_here: 'Regístrate aquí',
        login_here: 'Inicia sesión aquí',
        demo: 'Demo: admin / admin123',
        username_placeholder: 'Ingresa tu usuario',
        password_placeholder: 'Ingresa tu contraseña',
        confirm_placeholder: 'Confirma tu contraseña',
        username_hint: 'Mínimo 3 caracteres',
        password_hint: 'Mínimo 6 caracteres',
        login_success: '¡Inicio de sesión exitoso! Redirigiendo...',
        register_success: '¡Cuenta creada exitosamente! Redirigiendo a inicio de sesión...',
        login_error: 'Usuario o contraseña incorrectos',
        username_exists: 'Este usuario ya existe',
        password_short: 'La contraseña debe tener al menos 6 caracteres',
        passwords_match: 'Las contraseñas coinciden',
        passwords_no_match: 'Las contraseñas no coinciden',
        all_fields: 'Todos los campos son obligatorios',
        username_short: 'El usuario debe tener al menos 3 caracteres',
        error_occurred: 'Ocurrió un error. Por favor, inténtalo de nuevo.'
    },
    sw: {
        title: 'Kituo cha Ununuzi Shirazy',
        welcome_login: 'Karibu tena! Tafadhali ingia kuendelea',
        welcome_register: 'Unda akaunti yako kuanza',
        username: '👤 Jina la Mtumiaji',
        password: '🔒 Nenosiri',
        confirm: '✓ Thibitisha Nenosiri',
        fullname: '👤 Jina Kamili',
        login: '🔐 Ingia',
        register: '📝 Unda Akaunti',
        no_account: 'Huna akaunti?',
        have_account: 'Tayari una akaunti?',
        register_here: 'Jisajili hapa',
        login_here: 'Ingia hapa',
        demo: 'Demo: admin / admin123',
        username_placeholder: 'Ingiza jina lako la mtumiaji',
        password_placeholder: 'Ingiza nenosiri lako',
        confirm_placeholder: 'Thibitisha nenosiri lako',
        username_hint: 'Angalau herufi 3',
        password_hint: 'Angalau herufi 6',
        login_success: 'Kuingia kumefanikiwa! Inaelekeza...',
        register_success: 'Akaunti imeundwa! Inaelekeza kwenye kuingia...',
        login_error: 'Jina la mtumiaji au nenosiri si sahihi',
        username_exists: 'Jina la mtumiaji tayari lipo',
        password_short: 'Nenosiri lazima liwe na angalau herufi 6',
        passwords_match: 'Nenosiri linalingana',
        passwords_no_match: 'Nenosiri halilingani',
        all_fields: 'Sehemu zote zinahitajika',
        username_short: 'Jina la mtumiaji lazima liwe na angalau herufi 3',
        error_occurred: 'Hitilafu imetokea. Tafadhali jaribu tena.'
    }
};

let currentAuthLang = localStorage.getItem('auth_language') || 'en';

function setLanguage(lang) {
    currentAuthLang = lang;
    localStorage.setItem('auth_language', lang);
    
    const t = authTranslations[lang] || authTranslations.en;
    
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    
    document.title = t.title + ' - POS System';
    
    const titleEl = document.querySelector('.logo h1');
    if (titleEl) titleEl.textContent = t.title;
    
    const welcomeEl = document.querySelector('.logo p');
    if (welcomeEl) {
        const isLogin = window.location.pathname.includes('login');
        welcomeEl.textContent = isLogin ? t.welcome_login : t.welcome_register;
    }
    
    const usernameLabel = document.getElementById('username-label');
    const passwordLabel = document.getElementById('password-label');
    const confirmLabel = document.getElementById('confirm-label');
    const fullnameLabel = document.getElementById('fullname-label');
    
    if (usernameLabel) usernameLabel.textContent = t.username;
    if (passwordLabel) passwordLabel.textContent = t.password;
    if (confirmLabel) confirmLabel.textContent = t.confirm;
    if (fullnameLabel) fullnameLabel.textContent = t.fullname;
    
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirm-password');
    const fullnameInput = document.getElementById('fullname');
    
    if (usernameInput) usernameInput.placeholder = t.username_placeholder;
    if (passwordInput) passwordInput.placeholder = t.password_placeholder;
    if (confirmInput) confirmInput.placeholder = t.confirm_placeholder;
    if (fullnameInput) fullnameInput.placeholder = t.username_placeholder;
    
    const usernameHint = document.getElementById('username-hint');
    if (usernameHint) usernameHint.textContent = t.username_hint;
    
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    
    if (loginBtn) loginBtn.textContent = t.login;
    if (registerBtn) registerBtn.textContent = t.register;
    
    const noAccount = document.getElementById('no-account-text');
    const haveAccount = document.getElementById('have-account-text');
    const registerLink = document.getElementById('register-link');
    const loginLink = document.getElementById('login-link');
    
    if (noAccount && registerLink) {
        noAccount.innerHTML = `${t.no_account} <a href="register.html" id="register-link">${t.register_here}</a>`;
    }
    if (haveAccount && loginLink) {
        haveAccount.innerHTML = `${t.have_account} <a href="login.html" id="login-link">${t.login_here}</a>`;
    }
    
    const demoText = document.getElementById('demo-text');
    if (demoText) demoText.textContent = t.demo;
    
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.body.dir = dir;
}

document.addEventListener('DOMContentLoaded', function() {
    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirm-password');
    
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            checkPasswordStrength(this.value);
            checkPasswordMatch();
        });
    }
    
    if (confirmInput) {
        confirmInput.addEventListener('input', checkPasswordMatch);
    }
    
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const input = this.parentElement.querySelector('input');
            if (input) {
                input.type = input.type === 'password' ? 'text' : 'password';
            }
        });
    });
    
    const savedLang = localStorage.getItem('auth_language') || 'en';
    setLanguage(savedLang);
});