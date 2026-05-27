import { DB } from '../storage/db.js';
import { Storage } from '../storage/storage.js';
import { Modal, closeModal, showToast } from '../components/modal.js';
import { registerTransaction } from './finance.js';
import {
  ACTIVE_MARKETPLACE_STATUSES,
  MARKETPLACE_STATUS,
  buildMarketplaceMetrics,
  calculateProduct,
  calculateSale,
  normalizeProduct,
} from '../marketplace/marketplace-service.js';
import {
  bindMoneyInputs,
  formatMoney,
  formatNumber,
  formatSignedMoney,
  parseMoney,
  toNumber,
} from '../utils/format.js';

const STORES = {
  products: 'marketplace_products',
  categories: 'marketplace_categories',
  suppliers: 'marketplace_suppliers',
  sales: 'marketplace_sales',
};

const MarketplaceModule = (() => {
  let container = null;
  let products = [];
  let categories = [];
  let suppliers = [];
  let sales = [];
  let activeTab = 'opportunities';
  let search = '';
  let activeScope = null;

  async function init(target) {
    container = target;
    await ensureStores();
    await load();
    render();
  }

  async function ensureStores() {
    for (const storeName of Object.values(STORES)) {
      await DB.ensureStore(storeName, { keyPath: 'id', autoIncrement: true });
    }
  }

  async function load() {
    const [productRows, categoryRows, supplierRows, saleRows] = await Promise.all([
      Storage.getAll(STORES.products).catch(() => []),
      Storage.getAll(STORES.categories).catch(() => []),
      Storage.getAll(STORES.suppliers).catch(() => []),
      Storage.getAll(STORES.sales).catch(() => []),
    ]);
    products = productRows.map(normalizeProduct);
    categories = categoryRows.map(normalizeCategory);
    suppliers = supplierRows;
    sales = saleRows.sort((a, b) => new Date(b.saleDate || b.createdAt) - new Date(a.saleDate || a.createdAt));
  }

  function render() {
    if (!container) return;
    const metrics = buildMarketplaceMetrics(products);
    const visibleProducts = getVisibleProducts();

    container.innerHTML = `
      <div class="marketplace-module module-container">
        <div class="module-header marketplace-header">
          <div class="module-title-group">
            <span class="business-kicker">MK</span>
            <h2 class="module-title">Marketplace</h2>
            <span class="module-subtitle">Simulador de oportunidades, reventa, inventario inteligente y capital bloqueado.</span>
          </div>
          <div class="module-actions">
            <button class="btn btn-ghost" data-action="new-category">Crear categoria +</button>
            <button class="btn btn-ghost" data-action="new-supplier">Proveedor +</button>
            <button class="btn btn-primary" data-action="new-product">Nueva oportunidad</button>
          </div>
        </div>

        ${renderMetrics(metrics)}
        ${renderAlerts(metrics.alerts)}

        <div class="marketplace-tabs">
          ${tabButton('opportunities', 'Oportunidades', metrics.simulated.length)}
          ${tabButton('inventory', 'Inventario', metrics.active.length)}
          ${tabButton('categories', 'Categorias', categories.length)}
          ${tabButton('suppliers', 'Proveedores', suppliers.length)}
          ${tabButton('sales', 'Ventas', sales.length)}
          ${tabButton('metrics', 'Metricas', '')}
        </div>

        <div class="marketplace-toolbar">
          <div class="search-wrapper">
            <span class="search-icon">#</span>
            <input class="form-input search-input" data-action="search" placeholder="Buscar productos, SKU, proveedor o categoria" value="${escapeHtml(search)}">
          </div>
          <span>${visibleProducts.length} registros reales</span>
        </div>

        ${activeScope ? renderScopeBar(visibleProducts) : ''}
        ${renderTabContent(metrics, visibleProducts)}
      </div>
    `;

    bindEvents();
  }

  function renderMetrics(metrics) {
    const cards = [
      ['Capital bloqueado', formatMoney(metrics.capitalBlocked), 'inventario confirmado'],
      ['Productos activos', metrics.active.length, 'confirmados/publicados'],
      ['Vendidos', metrics.sold.length, 'ventas registradas'],
      ['Utilidad potencial', formatSignedMoney(metrics.utilityPotential), 'no realizada'],
      ['Utilidad real', formatSignedMoney(metrics.utilityReal), 'ventas reales'],
      ['Margen promedio', `${metrics.marginAverage.toFixed(1)}%`, 'sobre precio esperado'],
      ['ROI promedio', `${metrics.roiAverage.toFixed(1)}%`, 'esperado'],
      ['Rotacion promedio', labelize(metrics.rotationAverage), 'real por inventario'],
      ['Productos lentos', metrics.slowProducts, 'alerta rotacion'],
      ['Rentables', metrics.profitableProducts, 'ROI >= 20%'],
    ];

    return `
      <div class="marketplace-metrics-grid">
        ${cards.map(([label, value, detail]) => `
          <div class="market-metric">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(String(value))}</strong>
            <small>${escapeHtml(detail)}</small>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderAlerts(alerts) {
    if (!alerts.length) return '';
    return `
      <div class="market-alerts">
        ${alerts.map(alert => `
          <div class="market-alert ${alert.type}">
            <strong>${escapeHtml(alert.title)}</strong>
            <span>${escapeHtml(alert.text)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderTabContent(metrics, visibleProducts) {
    if (activeScope) return renderScopedProducts(visibleProducts);
    if (activeTab === 'categories') return renderCategories();
    if (activeTab === 'suppliers') return renderSuppliers();
    if (activeTab === 'metrics') return renderInternalMetrics(metrics);
    if (activeTab === 'sales') return renderSales();
    if (activeTab === 'inventory') return renderProductGrid(visibleProducts.filter(product => ACTIVE_MARKETPLACE_STATUSES.has(product.status)), 'Sin inventario confirmado');
    return renderProductGrid(visibleProducts.filter(product => product.status === MARKETPLACE_STATUS.SIMULATED), 'Sin oportunidades simuladas');
  }

  function tabButton(tab, label, count) {
    return `<button class="${tab === activeTab ? 'active' : ''}" data-tab="${tab}">${escapeHtml(label)}${count !== '' ? `<span>${count}</span>` : ''}</button>`;
  }

  function renderProductGrid(rows, emptyText) {
    if (!rows.length) {
      return `<div class="market-empty"><strong>${emptyText}</strong><span>Crea productos desde datos reales para activar metricas.</span></div>`;
    }

    return `
      <div class="market-card-grid">
        ${rows.map(renderProductCard).join('')}
      </div>
    `;
  }

  function renderProductCard(product) {
    const image = product.image || product.images || '';
    return `
      <article class="market-card ${product.status}">
        <div class="market-card-media">
          ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}">` : `<div class="market-card-placeholder">${escapeHtml((product.name || 'P').slice(0, 2).toUpperCase())}</div>`}
          <span class="market-status">${escapeHtml(labelize(product.status))}</span>
        </div>
        <div class="market-card-body">
          <div class="market-card-title">
            <div>
              <h3>${escapeHtml(product.name || 'Producto')}</h3>
              <span>${escapeHtml(getCategoryName(product.categoryId))} - ${escapeHtml(product.sku || 'Sin SKU')}</span>
            </div>
            <strong>${formatMoney(product.capitalBlocked)}</strong>
          </div>
          <p>${escapeHtml(product.description || 'Sin descripcion corta')}</p>
          <div class="market-badges">
              ${badge(`Demanda ${labelize(product.demand)}`, demandTone(product.demand))}
              ${badge(`Riesgo ${labelize(product.risk)}`, riskTone(product.risk))}
              ${badge(`Rotacion ${labelize(product.rotation)}`, rotationTone(product.rotation))}
              ${product.subCategory ? badge(product.subCategory, 'neutral') : ''}
          </div>
          <div class="market-card-indicators">
            ${indicator('Margen', formatSignedMoney(product.netMargin), product.netMargin)}
            ${indicator('ROI esperado', `${product.expectedRoi.toFixed(1)}%`, product.expectedRoi)}
            ${indicator('Utilidad potencial', formatSignedMoney(product.utilityPotential), product.utilityPotential)}
            ${indicator('Tiempo inventario', `${product.daysInInventory} dias`, -product.daysInInventory)}
          </div>
          <div class="market-card-actions">
            <button class="btn btn-ghost btn-sm" data-action="view-product" data-id="${product.id}">Ver</button>
            ${product.status === MARKETPLACE_STATUS.SIMULATED ? `<button class="btn btn-primary btn-sm" data-action="confirm-product" data-id="${product.id}">Confirmar compra</button>` : ''}
            ${ACTIVE_MARKETPLACE_STATUSES.has(product.status) ? `<button class="btn btn-primary btn-sm" data-action="sell-product" data-id="${product.id}">Vender</button>` : ''}
          </div>
        </div>
      </article>
    `;
  }

  function renderCategories() {
    if (!categories.length) {
      return `<div class="market-empty"><strong>No hay categorias</strong><span>Usa "Crear categoria +" para estructurar productos, variantes y lotes.</span></div>`;
    }
    return `
      <div class="market-list-grid">
        ${categories.map(category => `
          <button class="market-list-card market-container-card" data-action="open-category" data-id="${category.id}">
            <div class="market-list-image">${category.image ? `<img src="${escapeHtml(category.image)}" alt="">` : escapeHtml((category.name || 'CA').slice(0, 2).toUpperCase())}</div>
            <div>
              <h3>${escapeHtml(category.name)}</h3>
              <p>${escapeHtml(category.description || 'Sin descripcion')}</p>
              <span>${countProductsBy('categoryId', category.id)} producto(s) - ${category.subcategories.length || 'Sin'} subcategorias</span>
            </div>
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderSuppliers() {
    if (!suppliers.length) {
      return `<div class="market-empty"><strong>No hay proveedores</strong><span>Agrega proveedores para comparar origen, riesgo y contacto.</span></div>`;
    }
    return `
      <div class="market-list-grid">
        ${suppliers.map(supplier => `
          <button class="market-list-card market-container-card" data-action="open-supplier" data-id="${supplier.id}">
            <div class="market-list-image">PR</div>
            <div>
              <h3>${escapeHtml(supplier.name)}</h3>
              <p>${escapeHtml([supplier.company, supplier.city, supplier.type].filter(Boolean).join(' - '))}</p>
              <span>${countProductsBy('supplierId', supplier.id)} producto(s) - ${escapeHtml(supplier.whatsapp || supplier.phone || 'Sin contacto')}</span>
            </div>
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderScopeBar(visibleProducts) {
    const scoped = getScopedProducts(visibleProducts);
    return `
      <div class="market-scopebar">
        <div>
          <span>${activeScope.type === 'category' ? 'Categoria' : 'Proveedor'}</span>
          <strong>${escapeHtml(activeScope.label)}</strong>
        </div>
        <small>${scoped.length} producto(s) asociados en todos los estados</small>
        <div class="market-scope-actions">
          ${activeScope.type === 'category' ? `<button class="btn btn-ghost btn-sm" data-action="edit-category" data-id="${activeScope.id}">Editar categoria</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-action="clear-scope">Volver</button>
        </div>
      </div>
    `;
  }

  function renderScopedProducts(visibleProducts) {
    return renderProductGrid(getScopedProducts(visibleProducts), `Sin productos asociados a ${escapeHtml(activeScope.label)}`);
  }

  function renderSales() {
    if (!sales.length) {
      return `<div class="market-empty"><strong>Sin ventas registradas</strong><span>Las ventas reales apareceran aqui con utilidad y capital liberado.</span></div>`;
    }
    return `
      <div class="market-list-grid">
        ${sales.map(sale => `
          <div class="market-list-card">
            <div class="market-list-image">VT</div>
            <div>
              <h3>${escapeHtml(sale.productName || 'Venta Marketplace')}</h3>
              <p>${escapeHtml(sale.saleDate || sale.createdAt || '')} - ${formatMoney(sale.saleTotal)} - ${formatSignedMoney(sale.realProfit)}</p>
              <span>${escapeHtml(formatNumber(sale.quantitySold))} unidad(es) - capital liberado ${formatMoney(sale.costReleased)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderInternalMetrics(metrics) {
    return `
      <div class="market-analysis-grid">
        ${analysisBlock('Capital bloqueado', metrics.capitalBlocked, 'Capital invertido en inventario no vendido.')}
        ${analysisBlock('Utilidad potencial', metrics.utilityPotential, 'Solo productos simulados/activos, no afecta patrimonio.')}
        ${analysisBlock('Utilidad real', metrics.utilityReal, 'Solo ventas registradas.')}
        ${analysisBlock('Productos lentos', metrics.slowProducts, 'Rotacion calculada por dias y unidades vendidas.', false)}
        ${analysisBlock('Productos rentables', metrics.profitableProducts, 'ROI esperado o real mayor o igual a 20%.', false)}
      </div>
    `;
  }

  function analysisBlock(label, value, detail, money = true) {
    return `
      <div class="market-analysis-card">
        <span>${escapeHtml(label)}</span>
        <strong>${money ? formatSignedMoney(value) : escapeHtml(String(value))}</strong>
        <p>${escapeHtml(detail)}</p>
      </div>
    `;
  }

  function bindEvents() {
    container.querySelectorAll('[data-tab]').forEach(button => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.tab;
        activeScope = null;
        render();
      });
    });
    container.querySelector('[data-action="search"]')?.addEventListener('input', event => {
      search = event.target.value;
      render();
    });
    container.querySelector('[data-action="new-product"]')?.addEventListener('click', openProductModal);
    container.querySelector('[data-action="new-category"]')?.addEventListener('click', openCategoryModal);
    container.querySelector('[data-action="new-supplier"]')?.addEventListener('click', openSupplierModal);
    container.querySelector('[data-action="clear-scope"]')?.addEventListener('click', () => {
      activeScope = null;
      render();
    });
    container.querySelector('[data-action="edit-category"]')?.addEventListener('click', event => openCategoryModal(Number(event.currentTarget.dataset.id)));
    container.querySelectorAll('[data-action="open-category"]').forEach(button => button.addEventListener('click', () => openCategoryScope(Number(button.dataset.id))));
    container.querySelectorAll('[data-action="open-supplier"]').forEach(button => button.addEventListener('click', () => openSupplierScope(Number(button.dataset.id))));
    container.querySelectorAll('[data-action="view-product"]').forEach(button => button.addEventListener('click', () => openDetails(Number(button.dataset.id))));
    container.querySelectorAll('[data-action="confirm-product"]').forEach(button => button.addEventListener('click', () => confirmProduct(Number(button.dataset.id))));
    container.querySelectorAll('[data-action="sell-product"]').forEach(button => button.addEventListener('click', () => openSaleModal(Number(button.dataset.id))));
  }

  function openProductModal() {
    Modal.open({
      title: 'Nueva oportunidad Marketplace',
      size: 'xl',
      content: productForm(),
      footer: `
        <button class="btn btn-ghost" data-close-modal>Cancelar</button>
        <button class="btn btn-primary" id="market-save-product">Guardar simulacion</button>
      `,
    });
    const form = document.getElementById('market-product-form');
    bindMoneyInputs(form);
    form.addEventListener('input', () => updateProductPreview(form));
    form.querySelector('[name="categoryId"]')?.addEventListener('change', event => {
      if (event.target.value === '__create__') openCategoryModal();
      else refreshSubcategorySelect(form, event.target.value);
    });
    form.dispatchEvent(new Event('input'));
    document.getElementById('market-save-product')?.addEventListener('click', () => saveProduct(form));
  }

  function productForm() {
    const categoryOptions = categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('');
    const supplierOptions = suppliers.map(supplier => `<option value="${supplier.id}">${escapeHtml(supplier.name)}</option>`).join('');
    const selectedCategoryId = categories[0]?.id || '';
    return `
      <form id="market-product-form" class="market-form">
        <div class="market-form-grid">
          ${inputField('name', 'Nombre producto')}
          ${selectField('type', 'Tipo producto', [['individual','Producto individual'], ['lot','Producto en lote']])}
          <div class="form-group">
            <label class="form-label">Categoria</label>
            <select class="form-select" name="categoryId">${categoryOptions || '<option value="">Sin categorias</option>'}<option value="__create__">Crear categoria +</option></select>
          </div>
          <div class="form-group">
            <label class="form-label">Proveedor</label>
            <select class="form-select" name="supplierId"><option value="">Sin proveedor</option>${supplierOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Subcategoria</label>
            <select class="form-select" name="subCategory" data-role="subcategory-select">${renderSubcategoryOptions(selectedCategoryId)}</select>
          </div>
          ${inputField('sku', 'SKU / codigo')}
          ${inputField('image', 'Imagen producto URL')}
          ${selectField('status', 'Estado', [['simulado','Simulado'], ['confirmado','Confirmado']])}
        </div>
        ${textareaField('description', 'Descripcion corta')}
        <div class="market-form-grid">
          ${moneyField('quantity', 'Cantidad', '1')}
          ${moneyField('unitCost', 'Costo compra unitario')}
          ${moneyField('expectedSalePrice', 'Precio venta esperado')}
          ${selectField('demand', 'Demanda', [['baja','Baja'], ['media','Media'], ['alta','Alta']])}
          ${selectField('risk', 'Riesgo', [['bajo','Bajo'], ['medio','Medio'], ['alto','Alto']])}
        </div>
        <label class="market-toggle"><input type="checkbox" name="useAdvancedCosts"> Activar costos avanzados</label>
        <div class="market-advanced-costs">
          ${moneyField('shippingCost', 'Envio')}
          ${moneyField('adsCost', 'Publicidad')}
          ${moneyField('packagingCost', 'Empaques')}
          ${moneyField('taxCost', 'Impuestos')}
          ${moneyField('commissionCost', 'Comision')}
          ${moneyField('gatewayCost', 'Pasarela pago')}
          ${moneyField('storageCost', 'Almacenamiento')}
          ${moneyField('importCost', 'Importacion')}
          ${moneyField('customsCost', 'Aduana')}
          ${moneyField('transportCost', 'Transporte')}
          ${moneyField('otherCost', 'Otros')}
        </div>
        <div class="market-live-preview" id="market-live-preview"></div>
      </form>
    `;
  }

  async function saveProduct(form) {
    try {
      const values = readForm(form);
      if (!values.name) throw new Error('El producto necesita nombre.');
      if (!values.categoryId || values.categoryId === '__create__') throw new Error('Crea o selecciona una categoria.');
      const product = normalizeProduct({
        ...values,
        status: values.status || MARKETPLACE_STATUS.SIMULATED,
        createdAt: new Date().toISOString(),
      });
      const id = await Storage.add(STORES.products, product);
      product.id = id;
      if (product.status === MARKETPLACE_STATUS.CONFIRMED) await registerConfirmImpact(product);
      await logMarketplace('product_created', product, product.status === MARKETPLACE_STATUS.CONFIRMED ? product.totalCost : 0);
      closeModal();
      showToast('Producto guardado en Marketplace', 'success');
      await load();
      activeTab = product.status === MARKETPLACE_STATUS.SIMULATED ? 'opportunities' : 'inventory';
      render();
    } catch (error) {
      showToast(error.message || 'No se pudo guardar el producto', 'danger');
    }
  }

  async function confirmProduct(id) {
    const product = products.find(row => Number(row.id) === Number(id));
    if (!product || product.status !== MARKETPLACE_STATUS.SIMULATED) return;
    const confirmed = normalizeProduct({ ...product, status: MARKETPLACE_STATUS.CONFIRMED, confirmedAt: new Date().toISOString() });
    await Storage.update(STORES.products, confirmed);
    await registerConfirmImpact(confirmed);
    await logMarketplace('product_confirmed', confirmed, confirmed.totalCost);
    showToast('Compra confirmada: capital bloqueado registrado', 'success');
    await load();
    activeTab = 'inventory';
    render();
  }

  function openSaleModal(id) {
    const product = products.find(row => Number(row.id) === Number(id));
    if (!product) return;
    Modal.open({
      title: `Venta Marketplace - ${product.name}`,
      size: 'lg',
      content: `
        <form id="market-sale-form" class="market-form">
          <div class="market-form-grid">
            ${inputField('saleDate', 'Fecha venta', new Date().toISOString().slice(0, 10), 'date')}
            ${moneyField('quantitySold', 'Cantidad vendida', '1')}
            ${moneyField('salePrice', 'Precio venta unitario', product.expectedSalePrice)}
            ${moneyField('sellingCosts', 'Costos de venta')}
          </div>
          <div class="market-live-preview" id="market-sale-preview"></div>
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" data-close-modal>Cancelar</button>
        <button class="btn btn-primary" id="market-save-sale">Registrar venta</button>
      `,
    });
    const form = document.getElementById('market-sale-form');
    bindMoneyInputs(form);
    form.addEventListener('input', () => updateSalePreview(product, form));
    form.dispatchEvent(new Event('input'));
    document.getElementById('market-save-sale')?.addEventListener('click', () => saveSale(product, form));
  }

  async function saveSale(product, form) {
    try {
      const values = readForm(form);
      const sale = calculateSale(product, values);
      if (sale.saleTotal <= 0) throw new Error('La venta debe tener valor mayor a cero.');
      const saleRecord = {
        productId: product.id,
        productName: product.name,
        ...values,
        ...sale,
        createdAt: new Date().toISOString(),
      };
      await Storage.add(STORES.sales, saleRecord);
      const updated = normalizeProduct({
        ...product,
        unitsSold: sale.nextUnitsSold,
        status: sale.nextStatus,
        saleTotal: toNumber(product.saleTotal) + sale.saleTotal,
        realProfit: toNumber(product.realProfit) + sale.realProfit,
        costReleasedTotal: toNumber(product.costReleasedTotal) + sale.costReleased,
        roiReal: calculateCumulativeRoi(product, sale),
        lastSaleAt: values.saleDate || new Date().toISOString(),
      });
      await Storage.update(STORES.products, updated);
      await registerSaleImpact(updated, sale, values.saleDate);
      await logMarketplace('product_sold', updated, sale.saleTotal);
      closeModal();
      showToast('Venta registrada con utilidad real', 'success');
      await load();
      activeTab = sale.soldOut ? 'sales' : 'inventory';
      render();
    } catch (error) {
      showToast(error.message || 'No se pudo registrar la venta', 'danger');
    }
  }

  async function registerConfirmImpact(product) {
    if (!product.totalCost) return;
    await registerTransaction({
      type: 'egreso',
      category: 'compra_inventario',
      amount: product.totalCost,
      description: `Marketplace compra confirmada: ${product.name}`,
      reference: `MARKET-${product.id}`,
      date: product.purchaseDate || new Date().toISOString().slice(0, 10),
      sourceModule: 'marketplace',
      liquidImpact: -product.totalCost,
      investedImpact: product.totalCost,
      commercialAssetImpact: product.totalCost,
      realProfitImpact: 0,
      cashFlowImpact: 0,
      meta: { productId: product.id, marketplaceStatus: product.status },
    });
  }

  async function registerSaleImpact(product, sale, date) {
    await registerTransaction({
      type: 'ingreso',
      category: 'devolucion_capital',
      amount: sale.saleTotal,
      description: `Marketplace venta: ${product.name}`,
      reference: `MARKET-SALE-${product.id}-${Date.now()}`,
      date: date || new Date().toISOString().slice(0, 10),
      sourceModule: 'marketplace',
      liquidImpact: sale.saleTotal - sale.sellingCosts,
      investedImpact: -sale.costReleased,
      activePortfolioImpact: 0,
      commercialAssetImpact: -sale.costReleased,
      realProfitImpact: sale.realProfit,
      cashFlowImpact: sale.realProfit,
      meta: {
        productId: product.id,
        quantitySold: sale.quantitySold,
        costReleased: sale.costReleased,
        sellingCosts: sale.sellingCosts,
        realProfitAmount: sale.realProfit,
      },
    });
  }

  function openCategoryModal(categoryId = null) {
    const current = categories.find(category => Number(category.id) === Number(categoryId)) || null;
    Modal.open({
      title: current ? 'Editar categoria Marketplace' : 'Crear categoria Marketplace',
      size: 'md',
      content: `
        <form id="market-category-form" class="market-form">
          ${inputField('name', 'Nombre categoria', current?.name || '')}
          ${inputField('image', 'Imagen URL', current?.image || '')}
          ${inputField('icon', 'Color / icono', current?.icon || '')}
          ${textareaField('subcategories', 'Subcategorias (una por linea o separadas por coma)', (current?.subcategories || []).join('\n'))}
          ${textareaField('description', 'Descripcion', current?.description || '')}
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" data-close-modal>Cancelar</button>
        <button class="btn btn-primary" id="market-save-category">Guardar categoria</button>
      `,
    });
    document.getElementById('market-save-category')?.addEventListener('click', () => saveCategory(current));
  }

  async function saveCategory(current = null) {
    const form = document.getElementById('market-category-form');
    const values = readForm(form);
    if (!values.name) return showToast('La categoria necesita nombre', 'danger');
    const payload = { ...current, ...values, subcategories: parseSubcategories(values.subcategories) };
    if (current?.id) await Storage.update(STORES.categories, payload);
    else await Storage.add(STORES.categories, { ...payload, createdAt: new Date().toISOString() });
    closeModal();
    showToast(current?.id ? 'Categoria actualizada' : 'Categoria creada', 'success');
    await load();
    if (activeScope?.type === 'category' && current?.id === activeScope.id) {
      activeScope = { type: 'category', id: current.id, label: payload.name };
    }
    render();
  }

  function openSupplierModal() {
    Modal.open({
      title: 'Crear proveedor Marketplace',
      size: 'lg',
      content: `
        <form id="market-supplier-form" class="market-form">
          <div class="market-form-grid">
            ${inputField('name', 'Nombre')}
            ${inputField('company', 'Empresa')}
            ${inputField('phone', 'Celular')}
            ${inputField('whatsapp', 'WhatsApp')}
            ${inputField('city', 'Ciudad')}
            ${inputField('type', 'Tipo proveedor')}
          </div>
          ${inputField('address', 'Direccion')}
          ${inputField('social', 'Redes sociales')}
          ${textareaField('notes', 'Notas')}
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" data-close-modal>Cancelar</button>
        <button class="btn btn-primary" id="market-save-supplier">Guardar proveedor</button>
      `,
    });
    document.getElementById('market-save-supplier')?.addEventListener('click', saveSupplier);
  }

  async function saveSupplier() {
    const form = document.getElementById('market-supplier-form');
    const values = readForm(form);
    if (!values.name) return showToast('El proveedor necesita nombre', 'danger');
    await Storage.add(STORES.suppliers, { ...values, createdAt: new Date().toISOString() });
    closeModal();
    showToast('Proveedor creado', 'success');
    await load();
    render();
  }

  function openDetails(id) {
    const product = products.find(row => Number(row.id) === Number(id));
    if (!product) return;
    Modal.open({
      title: product.name,
      size: 'lg',
      content: `
        <div class="market-detail-grid">
          ${detail('Estado', labelize(product.status))}
          ${detail('Categoria', getCategoryName(product.categoryId))}
          ${detail('Subcategoria', product.subCategory || 'Sin subcategoria')}
          ${detail('Proveedor', getSupplierName(product.supplierId))}
          ${detail('Costo total', formatMoney(product.totalCost))}
          ${detail('Capital bloqueado', formatMoney(product.capitalBlocked))}
          ${detail('Utilidad potencial', formatSignedMoney(product.utilityPotential))}
          ${detail('Utilidad realizada', formatSignedMoney(product.realProfit))}
          ${detail('ROI esperado', `${product.expectedRoi.toFixed(1)}%`)}
          ${detail('ROI real', `${toNumber(product.roiReal).toFixed(1)}%`)}
          ${detail('Rotacion', labelize(product.rotation))}
        </div>
      `,
      footer: `<button class="btn btn-primary" data-close-modal>Cerrar</button>`,
    });
  }

  function updateProductPreview(form) {
    const preview = form.querySelector('#market-live-preview');
    const values = readForm(form);
    const metrics = calculateProduct(values);
    form.querySelector('.market-advanced-costs')?.classList.toggle('is-active', !!values.useAdvancedCosts);
    preview.innerHTML = renderPreview([
      ['Costo total', formatMoney(metrics.totalCost)],
      ['Precio sugerido', formatMoney(metrics.suggestedPrice)],
      ['Margen bruto', formatSignedMoney(metrics.grossMargin)],
      ['Margen neto', formatSignedMoney(metrics.netMargin)],
      ['ROI esperado', `${metrics.expectedRoi.toFixed(1)}%`],
      ['Utilidad potencial', formatSignedMoney(metrics.utilityPotential)],
    ]);
  }

  function updateSalePreview(product, form) {
    const preview = form.querySelector('#market-sale-preview');
    try {
      const sale = calculateSale(product, readForm(form));
      preview.innerHTML = renderPreview([
        ['Venta total', formatMoney(sale.saleTotal)],
        ['Costo liberado', formatMoney(sale.costReleased)],
        ['Costos venta', formatMoney(sale.sellingCosts)],
        ['Utilidad real', formatSignedMoney(sale.realProfit)],
        ['ROI real', `${sale.roiReal.toFixed(1)}%`],
      ]);
    } catch (_) {
      preview.innerHTML = '<div class="market-empty"><span>Completa los datos de venta para simular utilidad real.</span></div>';
    }
  }

  function renderPreview(items) {
    return `
      <div class="market-preview-grid">
        ${items.map(([label, value]) => `
          <div class="market-preview-item">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(String(value))}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  function getVisibleProducts() {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter(product => JSON.stringify(product).toLowerCase().includes(query));
  }

  function getScopedProducts(rows) {
    if (!activeScope) return rows;
    const key = activeScope.type === 'category' ? 'categoryId' : 'supplierId';
    return rows.filter(product => String(product[key] || '') === String(activeScope.id));
  }

  function getCategoryName(id) {
    return categories.find(category => String(category.id) === String(id))?.name || 'Sin categoria';
  }

  function getSupplierName(id) {
    return suppliers.find(supplier => String(supplier.id) === String(id))?.name || 'Sin proveedor';
  }

  function openCategoryScope(id) {
    const category = categories.find(row => Number(row.id) === Number(id));
    if (!category) return;
    activeScope = { type: 'category', id: category.id, label: category.name };
    activeTab = 'categories';
    render();
  }

  function openSupplierScope(id) {
    const supplier = suppliers.find(row => Number(row.id) === Number(id));
    if (!supplier) return;
    activeScope = { type: 'supplier', id: supplier.id, label: supplier.name };
    activeTab = 'suppliers';
    render();
  }

  function countProductsBy(key, id) {
    return products.filter(product => String(product[key] || '') === String(id)).length;
  }

  function refreshSubcategorySelect(form, categoryId) {
    const select = form.querySelector('[data-role="subcategory-select"]');
    if (select) select.innerHTML = renderSubcategoryOptions(categoryId);
  }

  function renderSubcategoryOptions(categoryId) {
    const subcategories = getCategorySubcategories(categoryId);
    if (!subcategories.length) return '<option value="">Sin subcategorias</option>';
    return `<option value="">Sin subcategoria</option>${subcategories.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`;
  }

  function getCategorySubcategories(categoryId) {
    return categories.find(category => String(category.id) === String(categoryId))?.subcategories || [];
  }

  async function logMarketplace(action, product, amount) {
    await Storage.History.log(action, {
      module: 'marketplace',
      category: 'marketplace',
      description: `Marketplace: ${product.name}`,
      amount,
      status: product.status,
      entityId: product.id,
    }).catch(() => {});
    window.dispatchEvent(new CustomEvent('finance:update', {
      detail: { source: 'marketplace', eventType: action, data: product },
    }));
  }

  return { init };
})();

function badge(text, tone) {
  return `<span class="market-badge ${tone}">${escapeHtml(text)}</span>`;
}

function indicator(label, value, score) {
  return `
    <div class="market-indicator ${toNumber(score) >= 0 ? 'positive' : 'negative'}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function demandTone(value) {
  return value === 'alta' ? 'success' : value === 'baja' ? 'warning' : 'info';
}

function riskTone(value) {
  return value === 'alto' ? 'danger' : value === 'bajo' ? 'success' : 'warning';
}

function rotationTone(value) {
  return value === 'rapida' ? 'success' : value === 'lenta' ? 'warning' : 'info';
}

function normalizeCategory(row = {}) {
  return {
    ...row,
    subcategories: parseSubcategories(row.subcategories),
  };
}

function parseSubcategories(value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '');
  return raw
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex(other => other.toLowerCase() === item.toLowerCase()) === index);
}

function calculateCumulativeRoi(product, sale) {
  const realProfit = toNumber(product.realProfit) + toNumber(sale.realProfit);
  const costReleased = toNumber(product.costReleasedTotal) + toNumber(sale.costReleased);
  return costReleased > 0 ? (realProfit / costReleased) * 100 : 0;
}

function inputField(name, label, value = '', type = 'text') {
  return `
    <div class="form-group">
      <label class="form-label">${escapeHtml(label)}</label>
      <input class="form-input" name="${name}" type="${type}" value="${escapeHtml(value)}">
    </div>
  `;
}

function moneyField(name, label, value = '') {
  return `
    <div class="form-group">
      <label class="form-label">${escapeHtml(label)}</label>
      <input class="form-input" name="${name}" type="text" data-money value="${value ? formatNumber(value) : ''}">
    </div>
  `;
}

function textareaField(name, label, value = '') {
  return `
    <div class="form-group">
      <label class="form-label">${escapeHtml(label)}</label>
      <textarea class="form-textarea" name="${name}" rows="3">${escapeHtml(value)}</textarea>
    </div>
  `;
}

function selectField(name, label, options) {
  return `
    <div class="form-group">
      <label class="form-label">${escapeHtml(label)}</label>
      <select class="form-select" name="${name}">
        ${options.map(([value, text]) => `<option value="${value}">${escapeHtml(text)}</option>`).join('')}
      </select>
    </div>
  `;
}

function readForm(form) {
  const values = {};
  form.querySelectorAll('[name]').forEach(input => {
    if (input.type === 'checkbox') values[input.name] = input.checked;
    else values[input.name] = input.dataset.money != null ? parseMoney(input.value) : input.value.trim();
  });
  return values;
}

function detail(label, value) {
  return `
    <div class="market-detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function labelize(value) {
  return String(value ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function initMarketplace(container) {
  return MarketplaceModule.init(container);
}

export { MarketplaceModule };
