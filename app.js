// ============================================
// GITHUB API CONFIGURATION
// ============================================

// === IMPORTANT: Replace with your GitHub credentials ===
const GITHUB_CONFIG = {
    token: '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',     // Replace with your new token
    owner: 'ugandaproject',                // Your GitHub username
    repo: 'shopping',                      // Your repository name
    branch: 'main'                         // or 'master'
};

// ============================================
// GITHUB API - READ/WRITE FILES
// ============================================

const GitHubAPI = {
    // Read a file from GitHub
    async readFile(path) {
        try {
            const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}?ref=${GITHUB_CONFIG.branch}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${GITHUB_CONFIG.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`GitHub API error: ${response.status}`);
            }
            
            const data = await response.json();
            const binaryString = atob(data.content);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const content = JSON.parse(new TextDecoder('utf-8').decode(bytes));
            return {
                content: content,
                sha: data.sha
            };
        } catch (error) {
            console.error('Error reading file from GitHub:', error);
            return null;
        }
    },

    // Write a file to GitHub
    async writeFile(path, content, message) {
        try {
            const existing = await this.readFile(path);
            
            const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`;
            
            const jsonString = JSON.stringify(content, null, 2);
            const encoder = new TextEncoder();
            const data = encoder.encode(jsonString);
            let binary = '';
            for (let i = 0; i < data.length; i++) {
                binary += String.fromCharCode(data[i]);
            }
            const base64Content = btoa(binary);
            
            const body = {
                message: message || `Update ${path}`,
                content: base64Content,
                branch: GITHUB_CONFIG.branch
            };
            
            if (existing && existing.sha) {
                body.sha = existing.sha;
            }
            
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${GITHUB_CONFIG.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(body)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`GitHub API error: ${response.status} - ${errorData.message}`);
            }
            
            const result = await response.json();
            console.log(`✅ File saved to GitHub: ${path}`);
            return result;
        } catch (error) {
            console.error('Error writing file to GitHub:', error);
            this.saveToLocalStorage(path, content);
            throw error;
        }
    },

    // Fallback: Save to localStorage
    saveToLocalStorage(path, content) {
        try {
            const table = path.replace('.json', '');
            const data = {};
            data[table] = content;
            localStorage.setItem(`db_${table}`, JSON.stringify(data));
            console.log(`💾 Saved to localStorage (backup): ${path}`);
        } catch (e) {
            console.error('Error saving to localStorage:', e);
        }
    },

    // Load from localStorage
    loadFromLocalStorage(table) {
        try {
            const data = localStorage.getItem(`db_${table}`);
            if (data) {
                const parsed = JSON.parse(data);
                return parsed[table] || [];
            }
            return [];
        } catch (e) {
            console.error('Error loading from localStorage:', e);
            return [];
        }
    }
};

// ============================================
// DATABASE MODULE
// ============================================

const DB = {
    async getAll(table) {
        try {
            const path = `db/${table}.json`;
            const result = await GitHubAPI.readFile(path);
            
            if (result && result.content) {
                const records = result.content[table] || [];
                this._cacheToLocalStorage(table, records);
                return records;
            }
            
            const localData = GitHubAPI.loadFromLocalStorage(table);
            if (localData.length > 0) {
                await this.saveAll(table, localData);
                return localData;
            }
            
            return [];
        } catch (error) {
            console.error(`Error loading ${table}:`, error);
            return GitHubAPI.loadFromLocalStorage(table);
        }
    },

    async saveAll(table, records) {
        try {
            const path = `db/${table}.json`;
            const data = {};
            data[table] = records;
            
            await GitHubAPI.writeFile(
                path,
                data,
                `Update ${table} data`
            );
            
            this._cacheToLocalStorage(table, records);
            return { success: true };
        } catch (error) {
            console.error(`Error saving ${table}:`, error);
            this._cacheToLocalStorage(table, records);
            return { success: false, error: error.message };
        }
    },

    _cacheToLocalStorage(table, records) {
        try {
            const data = {};
            data[table] = records;
            localStorage.setItem(`db_${table}`, JSON.stringify(data));
        } catch (e) {
            console.error('Error caching to localStorage:', e);
        }
    },

    async getById(table, id) {
        const records = await this.getAll(table);
        return records.find(r => r.id === id) || null;
    },

    async insert(table, record) {
        const records = await this.getAll(table);
        const maxId = records.reduce((max, r) => Math.max(max, r.id || 0), 0);
        record.id = maxId + 1;
        record.created_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
        records.push(record);
        await this.saveAll(table, records);
        return record;
    },

    async update(table, id, updates) {
        const records = await this.getAll(table);
        const index = records.findIndex(r => r.id === id);
        if (index === -1) return null;
        records[index] = { ...records[index], ...updates };
        await this.saveAll(table, records);
        return records[index];
    },

    async delete(table, id) {
        const records = await this.getAll(table);
        const filtered = records.filter(r => r.id !== id);
        if (filtered.length === records.length) return false;
        await this.saveAll(table, filtered);
        return true;
    },

    async search(table, query, fields = ['name']) {
        const records = await this.getAll(table);
        if (!query) return records;
        const q = query.toLowerCase();
        return records.filter(r => {
            return fields.some(field => {
                const value = r[field] || '';
                return String(value).toLowerCase().includes(q);
            });
        });
    },

    async count(table) {
        const records = await this.getAll(table);
        return records.length;
    },

    async sum(table, field) {
        const records = await this.getAll(table);
        return records.reduce((sum, r) => sum + (parseFloat(r[field]) || 0), 0);
    }
};

// ============================================
// LANGUAGE MODULE
// ============================================

const Lang = {
    currentLanguage: 'en',
    translations: {},
    
    async loadLanguage(lang) {
        try {
            const response = await fetch(`lang/${lang}.json?t=${Date.now()}`);
            if (!response.ok) {
                throw new Error('Language file not found');
            }
            this.translations = await response.json();
            this.currentLanguage = lang;
            localStorage.setItem('language', lang);
            this.applyDirection();
            this.updateUI();
        } catch (error) {
            console.error('Error loading language:', error);
            // Hardcoded fallback translations
            this.translations = {
                "app_name": "Shopping POS",
                "logout": "Logout",
                "sell_title": "Point of Sale",
                "all_products": "All Products",
                "shopping_cart": "Shopping Cart",
                "add_product_title": "Add Product",
                "manage_categories": "Manage Categories",
                "expenses_title": "Expenses",
                "treasury_title": "Treasury",
                "profit_title": "Profit",
                "orders_title": "Orders",
                "tab_sell": "Sell",
                "tab_add_product": "Add Product",
                "tab_categories": "Categories",
                "tab_expenses": "Expenses",
                "tab_treasury": "Treasury",
                "tab_profit": "Profit",
                "tab_orders": "Orders",
                "payment_cash": "Cash",
                "payment_bank": "Bank Transfer",
                "payment_card": "Card",
                "payment_mobile": "Mobile Money",
                "rent": "Rent",
                "utilities": "Utilities",
                "salaries": "Salaries",
                "inventory": "Inventory",
                "marketing": "Marketing",
                "maintenance": "Maintenance",
                "transport": "Transport",
                "other": "Other",
                "stock": "Stock",
                "not_available": "Not Available",
                "about_to_finish": "About to Finish",
                "edit": "Edit",
                "delete": "Delete",
                "view": "View",
                "close": "Close",
                "invoice": "Invoice",
                "invoice_number": "Invoice Number",
                "date": "Date",
                "client": "Client",
                "phone": "Phone",
                "order_items": "Order Items",
                "product": "Product",
                "quantity": "Quantity",
                "sell_price": "Sell Price",
                "total": "Total",
                "total_profit": "Total Profit",
                "amount_paid": "Amount Paid",
                "remaining": "Remaining",
                "status": "Status",
                "paid_status": "Paid",
                "partial_payment": "Partial Payment",
                "pending_status": "Pending",
                "thank_you": "Thank you for your business",
                "print_invoice": "Print Invoice",
                "no_products_found": "No products found",
                "no_categories": "No categories available",
                "no_orders": "No orders found",
                "no_expenses": "No expenses recorded",
                "no_items_in_cart": "No items in cart",
                "treasury_total": "Total",
                "available": "Available",
                "profit_per_item": "Profit per item",
                "client_info_required": "Client name and phone are required",
                "cart_empty": "Cart is empty",
                "order_saved": "Order saved successfully",
                "error_occurred": "An error occurred",
                "not_enough_stock": "Not enough stock. Available: {0}",
                "out_of_stock": "Product is out of stock",
                "product_added": "Product added successfully",
                "product_updated": "Product updated successfully",
                "category_added": "Category saved successfully",
                "expense_added": "Expense added successfully",
                "confirm_delete_product": "Are you sure you want to delete this product?",
                "confirm_delete_category": "Are you sure you want to delete this category?",
                "confirm_delete_order": "Are you sure you want to delete this order?",
                "confirm_delete_expense": "Are you sure you want to delete this expense?",
                "confirm_reset_cart": "Are you sure you want to clear the cart?",
                "product_name_required": "Product name and sell price are required",
                "category_name_required": "Category name is required",
                "expense_required": "Date and amount are required",
                "order_not_found": "Order not found",
                "save_category": "Save Category",
                "update_category": "Update Category",
                "no_category": "No Category",
                "dir": "ltr",
                "text_align": "left"
            };
            this.currentLanguage = 'en';
            this.applyDirection();
            this.updateUI();
        }
    },
    
    get(key, params = {}) {
        let text = this.translations[key] || key;
        Object.keys(params).forEach(param => {
            text = text.replace(`{${param}}`, params[param]);
        });
        return text;
    },
    
    applyDirection() {
        const dir = this.translations.dir || 'ltr';
        document.documentElement.dir = dir;
        document.documentElement.lang = this.currentLanguage;
        document.body.dir = dir;
        document.body.style.textAlign = this.translations.text_align || 'left';
    },
    
 updateUI() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        el.textContent = this.get(key);
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        el.placeholder = this.get(key);
    });
    
    document.title = this.get('app_name') + ' - POS System';
    
    const appName = document.getElementById('app-name');
    if (appName) appName.innerHTML = '🏪 ' + this.get('app_name');
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.innerHTML = '🚪 ' + this.get('logout');
    
    const sellTitle = document.getElementById('sell-title');
    if (sellTitle) sellTitle.textContent = '💰 ' + this.get('sell_title');
    
    const allProductsBtn = document.getElementById('all-products-btn');
    if (allProductsBtn) allProductsBtn.textContent = this.get('all_products');
    
    const cartTitle = document.getElementById('cart-title');
    if (cartTitle) cartTitle.innerHTML = '🛒 ' + this.get('shopping_cart') + ' <button id="close-cart">✖️</button>';
    
    const addProductTitle = document.getElementById('add-product-title');
    if (addProductTitle) addProductTitle.textContent = '➕ ' + this.get('add_product_title');
    
    const manageCategoriesTitle = document.getElementById('manage-categories-title');
    if (manageCategoriesTitle) manageCategoriesTitle.textContent = '📁 ' + this.get('manage_categories');
    
    const expensesTitle = document.getElementById('expenses-title');
    if (expensesTitle) expensesTitle.textContent = '💸 ' + this.get('expenses_title');
    
    const treasuryTitle = document.getElementById('treasury-title');
    if (treasuryTitle) treasuryTitle.textContent = '🏦 ' + this.get('treasury_title');
    
    const profitTitle = document.getElementById('profit-title');
    if (profitTitle) profitTitle.textContent = '📈 ' + this.get('profit_title');
    
    const ordersTitle = document.getElementById('orders-title');
    if (ordersTitle) ordersTitle.textContent = '📋 ' + this.get('orders_title');
    
    const tabTranslations = {
        'sell': 'tab_sell',
        'add-product': 'tab_add_product',
        'categories': 'tab_categories',
        'expenses': 'tab_expenses',
        'treasury': 'tab_treasury',
        'profit': 'tab_profit',
        'orders': 'tab_orders'
    };
    document.querySelectorAll('.tab-button').forEach(btn => {
        const key = btn.dataset.tab;
        if (tabTranslations[key]) {
            btn.textContent = this.get(tabTranslations[key]);
        }
    });
    
    // Fixed: Convert HTMLOptionsCollection to array before using forEach
    ['payment-type', 'expense-payment'].forEach(id => {
        const select = document.getElementById(id);
        if (select && select.options) {
            const options = Array.from(select.options);
            if (options.length > 0 && options[0]) options[0].text = this.get('payment_cash');
            if (options.length > 1 && options[1]) options[1].text = this.get('payment_bank');
            if (options.length > 2 && options[2]) options[2].text = this.get('payment_card');
            if (options.length > 3 && options[3]) options[3].text = this.get('payment_mobile');
        }
    });
    
    // Fixed: Convert HTMLOptionsCollection to array before using forEach
    const expenseCategorySelect = document.getElementById('expense-category');
    if (expenseCategorySelect && expenseCategorySelect.options) {
        const options = Array.from(expenseCategorySelect.options);
        const cats = ['rent', 'utilities', 'salaries', 'inventory', 'marketing', 'maintenance', 'transport', 'other'];
        for (let i = 0; i < options.length && i < cats.length; i++) {
            if (options[i]) {
                options[i].text = this.get(cats[i]);
            }
        }
    }
}
};

function setLanguage(lang) {
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    Lang.loadLanguage(lang).then(() => {
        if (app) {
            app.renderProducts();
            app.renderCategories();
            app.renderOrders();
            app.renderExpenses();
            app.renderTreasury();
            app.renderProfit();
            app.renderCartItems();
            app.updateCategorySelects();
            app.calculateRemaining();
        }
    });
}

// ============================================
// STATE MANAGEMENT
// ============================================

const AppState = {
    products: [],
    categories: [],
    orders: [],
    expenses: [],
    selectedItems: [],
    cartTotal: 0,
    cartProfit: 0,
    currentTab: 'sell',
    isCartVisible: true,
    currentCategory: 'all'
};

// ============================================
// MAIN APPLICATION
// ============================================

class ShoppingApp {
    constructor() {
        this._currentProduct = null;
        this.init();
    }

    async init() {
        const savedLang = localStorage.getItem('language') || 'en';
        await Lang.loadLanguage(savedLang);
        
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === savedLang);
        });
        
        await this.loadData();
        this.setupEventListeners();
        this.updateCategorySelects();
        this.renderProducts();
        this.renderCategories();
        this.renderOrders();
        this.renderExpenses();
        this.renderTreasury();
        this.renderProfit();
        this.loadSelectedItems();
        this.setupCart();
        this.setupTabs();
        
        const today = new Date().toISOString().split('T')[0];
        const expenseDate = document.getElementById('expense-date');
        if (expenseDate) expenseDate.value = today;
    }

    // ============================================
    // DATA LOADING
    // ============================================

    async loadData() {
        try {
            AppState.products = await DB.getAll('products');
            AppState.categories = await DB.getAll('categories');
            AppState.orders = await DB.getAll('orders');
            AppState.expenses = await DB.getAll('expenses');
            
            console.log('Data loaded from GitHub:', {
                products: AppState.products.length,
                categories: AppState.categories.length,
                orders: AppState.orders.length,
                expenses: AppState.expenses.length
            });
            
            if (AppState.products.length === 0) {
                AppState.products = [];
                await DB.saveAll('products', []);
            }
            if (AppState.categories.length === 0) {
                AppState.categories = [];
                await DB.saveAll('categories', []);
            }
            if (AppState.orders.length === 0) {
                AppState.orders = [];
                await DB.saveAll('orders', []);
            }
            if (AppState.expenses.length === 0) {
                AppState.expenses = [];
                await DB.saveAll('expenses', []);
            }
        } catch (error) {
            console.error('Error loading data:', error);
            AppState.products = [];
            AppState.categories = [];
            AppState.orders = [];
            AppState.expenses = [];
            await DB.saveAll('products', []);
            await DB.saveAll('categories', []);
            await DB.saveAll('orders', []);
            await DB.saveAll('expenses', []);
        }
    }

    saveState() {
        try {
            DB.saveAll('products', AppState.products);
            DB.saveAll('categories', AppState.categories);
            DB.saveAll('orders', AppState.orders);
            DB.saveAll('expenses', AppState.expenses);
        } catch (error) {
            console.error('Error saving state:', error);
        }
    }

    showAlert(messageKey, params = {}) {
        alert(Lang.get(messageKey, params));
    }

    // ============================================
    // PRODUCT CRUD
    // ============================================

    async addProduct(productData) {
        const product = {
            barcode: productData.barcode || '',
            name: productData.name,
            buy_price: parseFloat(productData.buy_price) || 0,
            sell_price: parseFloat(productData.sell_price) || 0,
            image: productData.image || 'assets/images/default-product.png',
            category_id: parseInt(productData.category_id) || 0,
            inventory: parseInt(productData.inventory) || 0
        };

        const result = await DB.insert('products', product);
        if (result) {
            AppState.products = await DB.getAll('products');
            this.renderProducts();
            this.renderTreasury();
            this.showAlert('product_added');
            return result;
        }
        return null;
    }

    async updateProduct(id, updates) {
        const result = await DB.update('products', id, updates);
        if (result) {
            AppState.products = await DB.getAll('products');
            this.renderProducts();
            this.renderTreasury();
            this.showAlert('product_updated');
            return result;
        }
        return null;
    }

    async deleteProduct(id) {
        if (!confirm(Lang.get('confirm_delete_product'))) return;
        
        const result = await DB.delete('products', id);
        if (result) {
            AppState.products = await DB.getAll('products');
            this.renderProducts();
            this.renderTreasury();
            this.showAlert('product_updated');
            return true;
        }
        return false;
    }

    // ============================================
    // CATEGORY CRUD
    // ============================================

    async addCategory(name) {
        const category = { name: name };
        const result = await DB.insert('categories', category);
        if (result) {
            AppState.categories = await DB.getAll('categories');
            this.renderCategories();
            this.updateCategorySelects();
            this.renderProducts();
            this.showAlert('category_added');
            return result;
        }
        return null;
    }

    async updateCategory(id, name) {
        const result = await DB.update('categories', id, { name });
        if (result) {
            AppState.categories = await DB.getAll('categories');
            this.renderCategories();
            this.updateCategorySelects();
            this.renderProducts();
            this.showAlert('category_added');
            return result;
        }
        return null;
    }

    async deleteCategory(id) {
        if (!confirm(Lang.get('confirm_delete_category'))) return;
        
        const result = await DB.delete('categories', id);
        if (result) {
            AppState.categories = await DB.getAll('categories');
            AppState.products = await DB.getAll('products');
            AppState.products.forEach(p => {
                if (p.category_id === id) {
                    p.category_id = 0;
                }
            });
            await DB.saveAll('products', AppState.products);
            this.renderCategories();
            this.updateCategorySelects();
            this.renderProducts();
            this.showAlert('category_added');
            return true;
        }
        return false;
    }

    // ============================================
    // ORDER CRUD
    // ============================================

    async createOrder(orderData) {
        const order = {
            invoice_number: orderData.invoice_number || 'INV-' + Date.now(),
            client_name: orderData.client_name,
            client_phone: orderData.client_phone,
            total: parseFloat(orderData.total) || 0,
            payment_type: orderData.payment_type || 'cash',
            transaction_number: orderData.transaction_number || '',
            paid_amount: parseFloat(orderData.paid_amount) || 0,
            remaining_amount: parseFloat(orderData.remaining_amount) || 0,
            profit: parseFloat(orderData.profit) || 0,
            items: orderData.items || []
        };

        const result = await DB.insert('orders', order);
        if (result) {
            AppState.orders = await DB.getAll('orders');
            this.renderOrders();
            this.renderProfit();
            
            if (order.items) {
                order.items.forEach(item => {
                    const product = AppState.products.find(p => p.id === item.product_id);
                    if (product) {
                        product.inventory = (product.inventory || 0) - item.quantity;
                    }
                });
                await DB.saveAll('products', AppState.products);
                this.renderProducts();
                this.renderTreasury();
            }
            return result;
        }
        return null;
    }

    async deleteOrder(id) {
        if (!confirm(Lang.get('confirm_delete_order'))) return;
        
        const result = await DB.delete('orders', id);
        if (result) {
            AppState.orders = await DB.getAll('orders');
            this.renderOrders();
            this.renderProfit();
            return true;
        }
        return false;
    }

    // ============================================
    // EXPENSE CRUD
    // ============================================

    async addExpense(expenseData) {
        const expense = {
            expense_date: expenseData.expense_date || new Date().toISOString().split('T')[0],
            category: expenseData.category,
            description: expenseData.description || '',
            amount: parseFloat(expenseData.amount) || 0,
            payment_method: expenseData.payment_method || 'cash'
        };

        const result = await DB.insert('expenses', expense);
        if (result) {
            AppState.expenses = await DB.getAll('expenses');
            this.renderExpenses();
            this.renderProfit();
            this.showAlert('expense_added');
            return result;
        }
        return null;
    }

    async deleteExpense(id) {
        if (!confirm(Lang.get('confirm_delete_expense'))) return;
        
        const result = await DB.delete('expenses', id);
        if (result) {
            AppState.expenses = await DB.getAll('expenses');
            this.renderExpenses();
            this.renderProfit();
            return true;
        }
        return false;
    }

    // ============================================
    // RENDER FUNCTIONS
    // ============================================

    renderProducts() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;
        
        const search = document.getElementById('product-search');
        const query = search ? search.value.toLowerCase() : '';
        const categoryFilter = AppState.currentCategory || 'all';

        let filtered = AppState.products;
        
        if (query) {
            filtered = filtered.filter(p => 
                p.name.toLowerCase().includes(query) ||
                (p.barcode && p.barcode.toLowerCase().includes(query))
            );
        }
        
        if (categoryFilter !== 'all') {
            filtered = filtered.filter(p => p.category_id === parseInt(categoryFilter));
        }

        if (filtered.length === 0) {
            grid.innerHTML = '<p style="text-align:center;padding:40px;color:#999;">' + Lang.get('no_products_found') + '</p>';
            return;
        }

        grid.innerHTML = filtered.map(p => {
            const sellPrice = parseFloat(p.sell_price || 0);
            const buyPrice = parseFloat(p.buy_price || 0);
            const inventory = parseInt(p.inventory || 0);
            
            return `
            <div class="product" data-id="${p.id}">
                <img src="${p.image || 'assets/images/default-product.png'}" alt="${this.escapeHtml(p.name)}" onerror="this.src='assets/images/default-product.png'">
                <p class="product-name">${this.escapeHtml(p.name)}</p>
                <p class="product-price">$${sellPrice.toFixed(2)}</p>
                <p class="product-stock">${Lang.get('stock')}: ${inventory}</p>
                ${inventory === 0 ? '<p class="not-available">❌ ' + Lang.get('not_available') + '</p>' : 
                  inventory < 30 ? '<p class="about-to-finish">⚠️ ' + Lang.get('about_to_finish') + '</p>' : ''}
                <div class="product-actions">
                    <button class="btn-edit" onclick="event.stopPropagation(); app.editProduct(${p.id})">✏️ ${Lang.get('edit')}</button>
                    <button class="btn-delete" onclick="event.stopPropagation(); app.deleteProduct(${p.id})">🗑️ ${Lang.get('delete')}</button>
                </div>
            </div>
            `;
        }).join('');

        grid.querySelectorAll('.product').forEach(el => {
            el.addEventListener('click', function(e) {
                if (e.target.closest('.product-actions')) return;
                const id = parseInt(this.dataset.id);
                const product = AppState.products.find(p => p.id === id);
                if (product) {
                    app.showQuantityModal(product);
                }
            });
        });
    }

    renderCategories() {
        const list = document.getElementById('categories-list');
        if (!list) return;

        if (AppState.categories.length === 0) {
            list.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;">' + Lang.get('no_categories') + '</td></tr>';
            return;
        }

        list.innerHTML = AppState.categories.map(c => `
            <tr>
                <td>${c.id}</td>
                <td>${this.escapeHtml(c.name)}</td>
                <td class="actions">
                    <button class="btn-edit" onclick="app.editCategory(${c.id})">✏️ ${Lang.get('edit')}</button>
                    <button class="btn-delete" onclick="app.deleteCategory(${c.id})">🗑️ ${Lang.get('delete')}</button>
                </td>
            </tr>
        `).join('');

        const nav = document.getElementById('categories-nav');
        if (nav) {
            let html = `<button onclick="app.filterProducts('all')" class="active">${Lang.get('all_products')}</button>`;
            AppState.categories.forEach(c => {
                html += `<button onclick="app.filterProducts(${c.id})">${this.escapeHtml(c.name)}</button>`;
            });
            nav.innerHTML = html;
        }
    }

    renderOrders() {
        const list = document.getElementById('orders-list');
        if (!list) return;

        if (AppState.orders.length === 0) {
            list.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;">' + Lang.get('no_orders') + '</td></tr>';
            return;
        }

        list.innerHTML = AppState.orders.map(o => `
            <tr>
                <td>${o.id}</td>
                <td>${this.escapeHtml(o.client_name)}</td>
                <td>${this.escapeHtml(o.client_phone)}</td>
                <td>$${parseFloat(o.total).toFixed(2)}</td>
                <td>$${parseFloat(o.paid_amount || 0).toFixed(2)}</td>
                <td style="color:${o.remaining_amount > 0 ? '#ff9800' : '#4CAF50'}">
                    $${parseFloat(o.remaining_amount || 0).toFixed(2)}
                </td>
                <td>${o.created_at || ''}</td>
                <td class="actions">
                    <button class="btn-view" onclick="app.viewOrder(${o.id})">👁️ ${Lang.get('view')}</button>
                    <button class="btn-delete" onclick="app.deleteOrder(${o.id})">🗑️ ${Lang.get('delete')}</button>
                </td>
            </tr>
        `).join('');
    }

    renderExpenses() {
        const list = document.getElementById('expenses-list');
        if (!list) return;

        if (AppState.expenses.length === 0) {
            list.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;">' + Lang.get('no_expenses') + '</td></tr>';
            return;
        }

        list.innerHTML = AppState.expenses.map(e => `
            <tr>
                <td>${e.expense_date || ''}</td>
                <td>${this.escapeHtml(e.category)}</td>
                <td>${this.escapeHtml(e.description || '')}</td>
                <td>$${parseFloat(e.amount).toFixed(2)}</td>
                <td>${e.payment_method || 'cash'}</td>
                <td class="actions">
                    <button class="btn-delete" onclick="app.deleteExpense(${e.id})">🗑️ ${Lang.get('delete')}</button>
                </td>
            </tr>
        `).join('');
    }

    renderTreasury() {
        const list = document.getElementById('treasury-list');
        if (!list) return;

        let totalQuantity = 0;
        let totalSellValue = 0;
        let totalBuyValue = 0;
        let totalProfit = 0;

        let html = '';
        AppState.products.forEach(p => {
            const buyPrice = parseFloat(p.buy_price || 0);
            const sellPrice = parseFloat(p.sell_price || 0);
            const inventory = parseInt(p.inventory || 0);
            const sellValue = sellPrice * inventory;
            const buyValue = buyPrice * inventory;
            const profit = sellValue - buyValue;

            totalQuantity += inventory;
            totalSellValue += sellValue;
            totalBuyValue += buyValue;
            totalProfit += profit;

            html += `
                <tr>
                    <td>${this.escapeHtml(p.name)}</td>
                    <td>${inventory}</td>
                    <td>$${buyPrice.toFixed(2)}</td>
                    <td>$${sellPrice.toFixed(2)}</td>
                    <td>$${sellValue.toFixed(2)}</td>
                    <td>$${buyValue.toFixed(2)}</td>
                    <td style="color:${profit >= 0 ? '#4CAF50' : '#f44336'}">
                        $${profit.toFixed(2)}
                    </td>
                </tr>
            `;
        });

        if (AppState.products.length === 0) {
            html = '<tr><td colspan="7" style="text-align:center;color:#999;">' + Lang.get('no_products_found') + '</td></tr>';
        } else {
            html += `
                <tr style="font-weight:bold;background:#f2f2f2;">
                    <td>${Lang.get('treasury_total')}</td>
                    <td>${totalQuantity}</td>
                    <td></td>
                    <td></td>
                    <td>$${totalSellValue.toFixed(2)}</td>
                    <td>$${totalBuyValue.toFixed(2)}</td>
                    <td style="color:${totalProfit >= 0 ? '#4CAF50' : '#f44336'}">
                        $${totalProfit.toFixed(2)}
                    </td>
                </tr>
            `;
        }

        list.innerHTML = html;
    }

    renderProfit() {
        const totalSales = AppState.orders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
        const totalProfit = AppState.orders.reduce((sum, o) => sum + parseFloat(o.profit || 0), 0);
        const totalExpenses = AppState.expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        const netProfit = totalProfit - totalExpenses;

        const salesEl = document.getElementById('total-sales');
        const profitEl = document.getElementById('total-profit');
        const expensesEl = document.getElementById('total-expenses');
        const netEl = document.getElementById('net-profit');
        
        if (salesEl) salesEl.textContent = '$' + totalSales.toFixed(2);
        if (profitEl) profitEl.textContent = '$' + totalProfit.toFixed(2);
        if (expensesEl) expensesEl.textContent = '$' + totalExpenses.toFixed(2);
        if (netEl) netEl.textContent = '$' + netProfit.toFixed(2);
        
        const netCard = document.getElementById('net-card');
        if (netCard) {
            netCard.style.background = netProfit >= 0 
                ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
                : 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)';
        }
    }

    // ============================================
    // SHOPPING CART
    // ============================================

    showQuantityModal(product) {
        if (product.inventory <= 0) {
            this.showAlert('out_of_stock');
            return;
        }

        const nameDisplay = document.getElementById('product-name-display');
        if (nameDisplay) {
            nameDisplay.innerHTML = `
                <strong>${this.escapeHtml(product.name)}</strong><br>
                ${Lang.get('available')}: ${product.inventory} ${Lang.get('quantity')}
            `;
        }
        
        const profitDisplay = document.getElementById('item-profit-display');
        if (profitDisplay) {
            const profitPerItem = parseFloat(product.sell_price) - parseFloat(product.buy_price || 0);
            profitDisplay.textContent = Lang.get('profit_per_item') + ': $' + profitPerItem.toFixed(2);
        }
        
        const quantityInput = document.getElementById('quantity-input');
        if (quantityInput) quantityInput.value = 1;
        
        const modal = document.getElementById('quantity-modal');
        const overlay = document.getElementById('quantity-overlay');
        if (modal) modal.style.display = 'block';
        if (overlay) overlay.style.display = 'block';

        this._currentProduct = product;
    }

    addToCart() {
        const quantityInput = document.getElementById('quantity-input');
        const quantity = parseInt(quantityInput ? quantityInput.value : 1) || 1;
        const product = this._currentProduct;
        
        if (!product) return;
        if (quantity > product.inventory) {
            this.showAlert('not_enough_stock', { 0: product.inventory });
            return;
        }

        const existing = AppState.selectedItems.find(item => item.id === product.id);
        if (existing) {
            const newQty = existing.quantity + quantity;
            if (newQty > product.inventory) {
                this.showAlert('not_enough_stock', { 0: product.inventory });
                return;
            }
            existing.quantity = newQty;
        } else {
            AppState.selectedItems.push({
                id: product.id,
                name: product.name,
                value: parseFloat(product.sell_price),
                buyPrice: parseFloat(product.buy_price || 0),
                inventory: product.inventory,
                quantity: quantity
            });
        }

        this.updateCart();
        this.closeQuantityModal();
    }

    updateCart() {
        let total = 0;
        let profit = 0;
        let count = 0;

        AppState.selectedItems.forEach(item => {
            total += item.value * item.quantity;
            profit += (item.value - item.buyPrice) * item.quantity;
            count += item.quantity;
        });

        AppState.cartTotal = total;
        AppState.cartProfit = profit;

        const totalEl = document.getElementById('cart-total');
        const badgeEl = document.getElementById('cart-badge');
        if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
        if (badgeEl) {
            badgeEl.textContent = count;
            badgeEl.style.display = count > 0 ? 'flex' : 'none';
        }

        this.renderCartItems();
        this.calculateRemaining();
        this.saveSelectedItems();
    }

    renderCartItems() {
        const container = document.getElementById('selected-products');
        if (!container) return;
        
        if (AppState.selectedItems.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">' + Lang.get('no_items_in_cart') + '</p>';
            return;
        }

        container.innerHTML = AppState.selectedItems.map(item => `
            <div>
                <div style="flex:2;">
                    <strong>${this.escapeHtml(item.name)}</strong>
                    <br><small>$${item.value.toFixed(2)} each</small>
                </div>
                <div style="flex:1;text-align:center;">
                    <input type="number" value="${item.quantity}" min="1" max="${item.inventory}" 
                           onchange="app.updateCartItem(${item.id}, this.value)">
                </div>
                <div style="flex:1;text-align:right;">
                    <strong>$${(item.value * item.quantity).toFixed(2)}</strong>
                    <br><small style="color:#4CAF50;">+$${((item.value - item.buyPrice) * item.quantity).toFixed(2)}</small>
                </div>
                <button onclick="app.removeFromCart(${item.id})" style="background:#f44336;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;">✖️</button>
            </div>
        `).join('');
    }

    updateCartItem(id, quantity) {
        const item = AppState.selectedItems.find(i => i.id === id);
        if (!item) return;
        
        quantity = parseInt(quantity) || 1;
        if (quantity < 1) quantity = 1;
        if (quantity > item.inventory) {
            this.showAlert('not_enough_stock', { 0: item.inventory });
            quantity = item.inventory;
        }
        
        item.quantity = quantity;
        this.updateCart();
    }

    removeFromCart(id) {
        AppState.selectedItems = AppState.selectedItems.filter(i => i.id !== id);
        this.updateCart();
    }

    calculateRemaining() {
        const paidInput = document.getElementById('paid-amount');
        const remainingEl = document.getElementById('remaining-amount');
        
        if (!paidInput || !remainingEl) return 0;
        
        const paid = parseFloat(paidInput.value) || 0;
        const remaining = AppState.cartTotal - paid;
        remainingEl.textContent = '$' + remaining.toFixed(2);
        remainingEl.style.color = remaining < 0 ? '#f44336' : remaining === 0 ? '#4CAF50' : '#ff9800';
        return remaining;
    }

    resetCart() {
        if (!confirm(Lang.get('confirm_reset_cart'))) return;
        this.clearCart();
    }

    clearCart() {
        AppState.selectedItems = [];
        AppState.cartTotal = 0;
        AppState.cartProfit = 0;
        
        const clientName = document.getElementById('client-name');
        const clientPhone = document.getElementById('client-phone');
        const transactionNumber = document.getElementById('transaction-number');
        const paidAmount = document.getElementById('paid-amount');
        
        if (clientName) clientName.value = '';
        if (clientPhone) clientPhone.value = '';
        if (transactionNumber) transactionNumber.value = '';
        if (paidAmount) paidAmount.value = 0;
        
        this.updateCart();
        this.saveSelectedItems();
        
        const remainingEl = document.getElementById('remaining-amount');
        if (remainingEl) {
            remainingEl.textContent = '$0.00';
            remainingEl.style.color = '#4CAF50';
        }
        
        const badgeEl = document.getElementById('cart-badge');
        if (badgeEl) {
            badgeEl.textContent = '0';
            badgeEl.style.display = 'none';
        }
        
        const totalEl = document.getElementById('cart-total');
        if (totalEl) totalEl.textContent = '$0.00';
        
        const container = document.getElementById('selected-products');
        if (container) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">' + Lang.get('no_items_in_cart') + '</p>';
        }
        
        localStorage.removeItem('cart_items');
        localStorage.removeItem('cart_total');
        
        console.log('🛒 Cart cleared');
    }

    // ============================================
    // PRINT INVOICE
    // ============================================

    async printInvoice() {
        const clientName = document.getElementById('client-name');
        const clientPhone = document.getElementById('client-phone');
        const paymentType = document.getElementById('payment-type');
        const transactionNumber = document.getElementById('transaction-number');
        const paidAmountInput = document.getElementById('paid-amount');
        
        if (!clientName || !clientPhone || !paymentType || !transactionNumber || !paidAmountInput) {
            this.showAlert('error_occurred');
            return;
        }

        const name = clientName.value.trim();
        const phone = clientPhone.value.trim();
        const type = paymentType.value;
        const trans = transactionNumber.value.trim();
        const paid = parseFloat(paidAmountInput.value) || 0;

        if (!name || !phone) {
            this.showAlert('client_info_required');
            return;
        }

        if (AppState.selectedItems.length === 0) {
            this.showAlert('cart_empty');
            return;
        }

        const remainingAmount = AppState.cartTotal - paid;
        const invoiceNumber = 'INV-' + Date.now();

        const order = {
            invoice_number: invoiceNumber,
            client_name: name,
            client_phone: phone,
            total: AppState.cartTotal,
            payment_type: type,
            transaction_number: trans,
            paid_amount: paid,
            remaining_amount: remainingAmount,
            profit: AppState.cartProfit,
            items: AppState.selectedItems.map(item => ({
                product_id: item.id,
                quantity: item.quantity,
                price: item.value,
                buy_price: item.buyPrice
            }))
        };

        const result = await this.createOrder(order);
        if (result) {
            this.showAlert('order_saved');
            this.printInvoiceWindow(order);
            this.clearCart();
        } else {
            this.showAlert('error_occurred');
        }
    }

    printInvoiceWindow(order) {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            this.showAlert('error_occurred');
            return;
        }
        
        let itemsHtml = order.items.map((item, index) => {
            const product = AppState.products.find(p => p.id === item.product_id);
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${product ? this.escapeHtml(product.name) : 'Unknown'}</td>
                    <td style="text-align:center;">${item.quantity}</td>
                    <td style="text-align:right;">$${item.price.toFixed(2)}</td>
                    <td style="text-align:right;">$${(item.price * item.quantity).toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        const status = order.remaining_amount <= 0 ? 
            '<span style="color:#4CAF50;">✅ ' + Lang.get('paid_status') + '</span>' :
            (order.paid_amount > 0 ? 
                '<span style="color:#ff9800;">⚠️ ' + Lang.get('partial_payment') + '</span>' :
                '<span style="color:#f44336;">⏳ ' + Lang.get('pending_status') + '</span>');

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Invoice ${order.invoice_number}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                    .invoice { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
                    .header h1 { margin: 0; font-size: 28px; color: #0078d7; }
                    .header p { margin: 5px 0; color: #666; }
                    .details { margin: 20px 0; }
                    .details table { width: 100%; }
                    .details td { padding: 5px; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th { background: #333; color: white; padding: 10px; text-align: left; }
                    td { padding: 10px; border-bottom: 1px solid #ddd; }
                    .total { text-align: right; font-size: 20px; font-weight: bold; margin: 20px 0; padding-top: 20px; border-top: 2px solid #333; }
                    .total p { margin: 5px 0; }
                    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; }
                    .no-print { text-align: center; margin-top: 20px; }
                    .no-print button { padding: 10px 30px; margin: 0 10px; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; }
                    .no-print .print-btn { background: #0078d7; color: white; }
                    .no-print .print-btn:hover { background: #005a9e; }
                    .no-print .close-btn { background: #666; color: white; }
                    .no-print .close-btn:hover { background: #555; }
                    @media print { body { background: white; margin: 0; } .invoice { box-shadow: none; padding: 20px; } .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="invoice">
                    <div class="header">
                        <h1>🧾 ${Lang.get('invoice')}</h1>
                        <p>${Lang.get('app_name')}</p>
                    </div>
                    <div class="details">
                        <table>
                            <tr>
                                <td><strong>${Lang.get('invoice_number')}</strong></td>
                                <td>${order.invoice_number}</td>
                                <td><strong>${Lang.get('date')}</strong></td>
                                <td>${new Date().toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td><strong>${Lang.get('client')}</strong></td>
                                <td>${this.escapeHtml(order.client_name)}</td>
                                <td><strong>${Lang.get('phone')}</strong></td>
                                <td>${this.escapeHtml(order.client_phone)}</td>
                            </tr>
                        </table>
                    </div>
                    <h3>${Lang.get('order_items')}</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>${Lang.get('product')}</th>
                                <th style="text-align:center;">${Lang.get('quantity')}</th>
                                <th style="text-align:right;">${Lang.get('sell_price')}</th>
                                <th style="text-align:right;">${Lang.get('total')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>
                    <div class="total">
                        <p><strong>${Lang.get('total')}:</strong> $${order.total.toFixed(2)}</p>
                        <p style="font-size:16px;color:#4CAF50;"><strong>${Lang.get('total_profit')}:</strong> $${order.profit.toFixed(2)}</p>
                        <p style="font-size:16px;"><strong>${Lang.get('amount_paid')}:</strong> $${order.paid_amount.toFixed(2)}</p>
                        <p style="font-size:16px;color:${order.remaining_amount > 0 ? '#ff9800' : '#4CAF50'}">
                            <strong>${Lang.get('remaining')}:</strong> $${order.remaining_amount.toFixed(2)}
                        </p>
                        <p style="font-size:16px;"><strong>${Lang.get('status')}:</strong> ${status}</p>
                    </div>
                    <div class="footer">
                        <p>${Lang.get('thank_you')} 🙏</p>
                    </div>
                    <div class="no-print">
                        <button class="print-btn" onclick="window.print()">🖨️ ${Lang.get('print_invoice')}</button>
                        <button class="close-btn" onclick="window.close()">❌ ${Lang.get('close')}</button>
                    </div>
                </div>
            </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    }

    closeQuantityModal() {
        const modal = document.getElementById('quantity-modal');
        const overlay = document.getElementById('quantity-overlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
        this._currentProduct = null;
    }

    saveSelectedItems() {
        try {
            localStorage.setItem('cart_items', JSON.stringify(AppState.selectedItems));
            localStorage.setItem('cart_total', AppState.cartTotal);
        } catch (e) {
            console.error('Error saving cart:', e);
        }
    }

    loadSelectedItems() {
        try {
            const items = localStorage.getItem('cart_items');
            const total = localStorage.getItem('cart_total');
            if (items) {
                AppState.selectedItems = JSON.parse(items);
                AppState.cartTotal = total ? parseFloat(total) : 0;
                this.updateCart();
            }
        } catch (e) {
            console.error('Error loading cart:', e);
        }
    }

    // ============================================
    // UI UTILITIES
    // ============================================

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    filterProducts(categoryId) {
        AppState.currentCategory = categoryId;
        document.querySelectorAll('.categories-nav button').forEach(btn => btn.classList.remove('active'));
        const buttons = document.querySelectorAll('.categories-nav button');
        const index = categoryId === 'all' ? 0 : 
            AppState.categories.findIndex(c => c.id === categoryId) + 1;
        if (buttons[index]) buttons[index].classList.add('active');
        this.renderProducts();
    }

    searchProducts() {
        this.renderProducts();
    }

    toggleCart() {
        AppState.isCartVisible = !AppState.isCartVisible;
        const container = document.getElementById('cart-container');
        const toggle = document.getElementById('cart-toggle');
        
        if (container) {
            container.classList.toggle('cart-hidden', !AppState.isCartVisible);
        }
        if (toggle) {
            toggle.classList.toggle('cart-visible', AppState.isCartVisible);
        }
        localStorage.setItem('cartVisible', AppState.isCartVisible);
    }

    setupCart() {
        const saved = localStorage.getItem('cartVisible');
        if (saved === 'false') {
            AppState.isCartVisible = false;
            const container = document.getElementById('cart-container');
            const toggle = document.getElementById('cart-toggle');
            if (container) container.classList.add('cart-hidden');
            if (toggle) toggle.classList.remove('cart-visible');
        }

        const cartToggle = document.getElementById('cart-toggle');
        const closeCart = document.getElementById('close-cart');
        if (cartToggle) cartToggle.addEventListener('click', () => this.toggleCart());
        if (closeCart) closeCart.addEventListener('click', () => this.toggleCart());

        const addBtn = document.getElementById('add-to-bill');
        const closeModalBtn = document.getElementById('close-quantity-modal');
        const overlay = document.getElementById('quantity-overlay');
        
        if (addBtn) addBtn.addEventListener('click', () => this.addToCart());
        if (closeModalBtn) closeModalBtn.addEventListener('click', () => this.closeQuantityModal());
        if (overlay) overlay.addEventListener('click', () => this.closeQuantityModal());

        const resetBtn = document.getElementById('reset-market-list');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetCart());

        const printBtn = document.getElementById('print-invoice');
        if (printBtn) printBtn.addEventListener('click', () => this.printInvoice());

        const paidInput = document.getElementById('paid-amount');
        if (paidInput) paidInput.addEventListener('input', () => this.calculateRemaining());
    }

    // ============================================
    // TAB MANAGEMENT
    // ============================================

    setupTabs() {
        const buttons = document.querySelectorAll('.tab-button');
        const contents = document.querySelectorAll('.tab-content');

        buttons.forEach(btn => {
            btn.addEventListener('click', function() {
                const tab = this.dataset.tab;
                
                buttons.forEach(b => b.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                
                this.classList.add('active');
                const content = document.getElementById(tab);
                if (content) content.classList.add('active');
                
                AppState.currentTab = tab;
                
                if (tab === 'treasury') app.renderTreasury();
                if (tab === 'profit') app.renderProfit();
                if (tab === 'orders') app.renderOrders();
                
                window.location.hash = tab;
            });
        });

        const hash = window.location.hash.replace('#', '');
        if (hash) {
            const btn = document.querySelector(`.tab-button[data-tab="${hash}"]`);
            if (btn) btn.click();
        }
    }

    // ============================================
    // EDIT PRODUCT
    // ============================================

    editProduct(id) {
        const product = AppState.products.find(p => p.id === id);
        if (!product) return;

        const editId = document.getElementById('edit-id');
        const editName = document.getElementById('edit-name');
        const editBuyPrice = document.getElementById('edit-buy-price');
        const editSellPrice = document.getElementById('edit-sell-price');
        const editInventory = document.getElementById('edit-inventory');
        const editCategory = document.getElementById('edit-category');
        
        if (editId) editId.value = product.id;
        if (editName) editName.value = product.name;
        if (editBuyPrice) editBuyPrice.value = product.buy_price || 0;
        if (editSellPrice) editSellPrice.value = product.sell_price;
        if (editInventory) editInventory.value = product.inventory;
        if (editCategory) editCategory.value = product.category_id || 0;

        const modal = document.getElementById('edit-modal');
        const overlay = document.getElementById('edit-overlay');
        if (modal) modal.style.display = 'block';
        if (overlay) overlay.style.display = 'block';
    }

    closeEditModal() {
        const modal = document.getElementById('edit-modal');
        const overlay = document.getElementById('edit-overlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
    }

    async saveEdit() {
        const id = parseInt(document.getElementById('edit-id').value);
        const name = document.getElementById('edit-name').value.trim();
        const buyPrice = parseFloat(document.getElementById('edit-buy-price').value) || 0;
        const sellPrice = parseFloat(document.getElementById('edit-sell-price').value) || 0;
        const inventory = parseInt(document.getElementById('edit-inventory').value) || 0;
        const categoryId = parseInt(document.getElementById('edit-category').value) || 0;

        if (!name) {
            this.showAlert('product_name_required');
            return;
        }

        await this.updateProduct(id, {
            name,
            buy_price: buyPrice,
            sell_price: sellPrice,
            inventory,
            category_id: categoryId
        });

        this.closeEditModal();
    }

    // ============================================
    // EDIT CATEGORY
    // ============================================

    editCategory(id) {
        const category = AppState.categories.find(c => c.id === id);
        if (!category) return;

        const catId = document.getElementById('category-id');
        const catName = document.getElementById('category-name');
        const submitBtn = document.getElementById('save-category-btn');
        
        if (catId) catId.value = category.id;
        if (catName) catName.value = category.name;
        if (submitBtn) submitBtn.textContent = '💾 ' + Lang.get('update_category');
    }

    // ============================================
    // VIEW ORDER
    // ============================================

    viewOrder(id) {
        const order = AppState.orders.find(o => o.id === id);
        if (!order) {
            this.showAlert('order_not_found');
            return;
        }
        this.printInvoiceWindow(order);
    }

    // ============================================
    // UPDATE CATEGORY SELECTS
    // ============================================

    updateCategorySelects() {
        const selects = ['category-id', 'edit-category'];
        selects.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            
            const currentValue = el.value;
            el.innerHTML = '<option value="0">' + Lang.get('no_category') + '</option>' + 
                AppState.categories.map(c => 
                    `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`
                ).join('');
            el.value = currentValue;
        });
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    setupEventListeners() {
        // Add Product Form
        const addProductForm = document.getElementById('add-product-form');
        if (addProductForm) {
            addProductForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('product-name').value.trim();
                const buyPrice = parseFloat(document.getElementById('buy-price').value) || 0;
                const sellPrice = parseFloat(document.getElementById('sell-price').value) || 0;
                const inventory = parseInt(document.getElementById('inventory').value) || 0;
                const categoryId = parseInt(document.getElementById('category-id').value) || 0;
                const barcode = document.getElementById('barcode').value.trim();

                if (!name || !sellPrice) {
                    this.showAlert('product_name_required');
                    return;
                }

                let image = 'assets/images/default-product.png';
                const fileInput = document.getElementById('product-image');
                if (fileInput && fileInput.files && fileInput.files[0]) {
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        image = e.target.result;
                        await this.addProduct({ name, buy_price: buyPrice, sell_price: sellPrice, 
                            inventory, category_id: categoryId, barcode, image });
                        addProductForm.reset();
                    };
                    reader.readAsDataURL(fileInput.files[0]);
                    return;
                }

                await this.addProduct({ name, buy_price: buyPrice, sell_price: sellPrice, 
                    inventory, category_id: categoryId, barcode, image });
                addProductForm.reset();
                this.showAlert('product_added');
            });
        }

        // Category Form
        const categoryForm = document.getElementById('category-form');
        if (categoryForm) {
            categoryForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = document.getElementById('category-id').value;
                const name = document.getElementById('category-name').value.trim();

                if (!name) {
                    this.showAlert('category_name_required');
                    return;
                }

                if (id) {
                    await this.updateCategory(parseInt(id), name);
                    document.getElementById('category-id').value = '';
                    document.getElementById('save-category-btn').textContent = '💾 ' + Lang.get('save_category');
                } else {
                    await this.addCategory(name);
                }
                document.getElementById('category-name').value = '';
                this.showAlert('category_added');
            });
        }

        // Expense Form
        const expenseForm = document.getElementById('expense-form');
        if (expenseForm) {
            expenseForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const date = document.getElementById('expense-date').value;
                const category = document.getElementById('expense-category').value;
                const amount = parseFloat(document.getElementById('expense-amount').value) || 0;
                const description = document.getElementById('expense-description').value.trim();
                const paymentMethod = document.getElementById('expense-payment').value;

                if (!date || !amount) {
                    this.showAlert('expense_required');
                    return;
                }

                await this.addExpense({
                    expense_date: date,
                    category,
                    amount,
                    description,
                    payment_method: paymentMethod
                });

                expenseForm.reset();
                const today = new Date().toISOString().split('T')[0];
                const expenseDate = document.getElementById('expense-date');
                if (expenseDate) expenseDate.value = today;
                this.showAlert('expense_added');
            });
        }

        // Edit Product Form
        const editProductForm = document.getElementById('edit-product-form');
        if (editProductForm) {
            editProductForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveEdit();
            });
        }

        // Close Edit Modal
        const closeEditBtn = document.getElementById('close-edit-modal');
        const editOverlay = document.getElementById('edit-overlay');
        if (closeEditBtn) closeEditBtn.addEventListener('click', () => this.closeEditModal());
        if (editOverlay) editOverlay.addEventListener('click', () => this.closeEditModal());

        // Search
        const searchInput = document.getElementById('product-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.searchProducts());
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeQuantityModal();
                this.closeEditModal();
            }
        });
    }
}

// ============================================
// LOGOUT
// ============================================

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('auth_session');
        localStorage.removeItem('cart_items');
        localStorage.removeItem('cart_total');
        localStorage.removeItem('cartVisible');
        window.location.href = 'login.html';
    }
}

// ============================================
// INITIALIZE APP
// ============================================

let app;

document.addEventListener('DOMContentLoaded', () => {
    const session = localStorage.getItem('auth_session');
    if (!session) {
        window.location.href = 'login.html';
        return;
    }
    
    app = new ShoppingApp();
});

window.app = app;
window.logout = logout;
window.setLanguage = setLanguage;


