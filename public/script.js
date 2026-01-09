// ERP System JavaScript

let csrfToken = null;
let currentUser = null;

let currentModule = 'queries';
let currentQueryId = null;
let itemCounter = 0;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadSuggestions();
    loadAllQueries();
    setupEventListeners();
    setDefaultDates();
    setupTagInput(); // Initialize tag input system
    initCsrfToken();
});

// Set default dates
function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;
    document.getElementById('enquiry-date').value = today;
}

// Setup event listeners
function setupEventListeners() {
    // Query form submission
    document.getElementById('query-form').addEventListener('submit', handleQuerySubmit);
    
    // Tab change events
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', function(e) {
            const target = e.target.getAttribute('href');
            if (target === '#pending-queries') {
                loadQueries('pending');
            } else if (target === '#submitted-queries') {
                loadQueries('submitted');
            } else if (target === '#deleted-queries') {
                loadQueries('deleted');
            }
        });
    });
}

// Show/Hide modules with enhanced UX
function showModule(moduleName, clickedElement = null) {
    // Prevent multiple rapid clicks
    if (document.body.classList.contains('module-switching')) {
        return;
    }
    
    // Add switching state
    document.body.classList.add('module-switching');
    
    // Show loading indicator
    showModuleLoadingState(moduleName);
    
    // Get current and target modules
    const currentModuleElement = document.querySelector('.module-content:not(.d-none)');
    const targetModuleElement = document.getElementById(moduleName + '-module');
    
    // Update navigation immediately for better UX
    updateNavigationState(clickedElement || event?.target, moduleName);
    
    // Animate transition
    if (currentModuleElement && currentModuleElement !== targetModuleElement) {
        // Fade out current module
        currentModuleElement.style.opacity = '0';
        currentModuleElement.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            // Hide current module
            currentModuleElement.classList.add('d-none');
            currentModuleElement.style.opacity = '';
            currentModuleElement.style.transform = '';
            
            // Show target module with animation
            showTargetModule(targetModuleElement, moduleName);
        }, 150);
    } else {
        // Direct show if no current module
        showTargetModule(targetModuleElement, moduleName);
    }
}

// Show loading state for module
function showModuleLoadingState(moduleName) {
    const moduleElement = document.getElementById(moduleName + '-module');
    if (moduleElement) {
        // Add loading overlay if it doesn't exist
        let loadingOverlay = moduleElement.querySelector('.module-loading-overlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'module-loading-overlay';
            loadingOverlay.innerHTML = `
                <div class="loading-content">
                    <div class="loading-spinner-large"></div>
                    <p class="loading-text">Loading ${getModuleDisplayName(moduleName)}...</p>
                </div>
            `;
            moduleElement.appendChild(loadingOverlay);
        }
        loadingOverlay.style.display = 'flex';
    }
}

// Hide loading state for module
function hideModuleLoadingState(moduleName) {
    const moduleElement = document.getElementById(moduleName + '-module');
    if (moduleElement) {
        const loadingOverlay = moduleElement.querySelector('.module-loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }
}

// Get display name for module
function getModuleDisplayName(moduleName) {
    const displayNames = {
        'queries': 'Queries',
        'quotations': 'Quotations',
        'purchase-orders': 'Purchase Orders',
        'invoices': 'Invoices',
        'admin': 'Admin Panel'
    };
    return displayNames[moduleName] || moduleName;
}

// Update navigation state
function updateNavigationState(clickedElement, moduleName) {
    // Update navigation active state
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        link.style.transform = '';
    });
    
    if (clickedElement) {
        clickedElement.classList.add('active');
        // Add subtle animation to clicked nav item
        clickedElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            clickedElement.style.transform = '';
        }, 150);
    }
    
    // Update current module
    currentModule = moduleName;
}

// Show target module with animation
function showTargetModule(targetModuleElement, moduleName) {
    // Show target module
    targetModuleElement.classList.remove('d-none');
    targetModuleElement.style.opacity = '0';
    targetModuleElement.style.transform = 'translateY(10px)';
    
    // Animate in
    setTimeout(() => {
        targetModuleElement.style.opacity = '1';
        targetModuleElement.style.transform = 'translateY(0)';
        
        // Load module data
        loadModuleData(moduleName).finally(() => {
            // Hide loading state
            hideModuleLoadingState(moduleName);
            
            // Remove switching state
            setTimeout(() => {
                document.body.classList.remove('module-switching');
                targetModuleElement.style.opacity = '';
                targetModuleElement.style.transform = '';
            }, 300);
        });
    }, 50);
}

// Load module data asynchronously
async function loadModuleData(moduleName) {
    try {
        if (moduleName === 'queries') {
            await loadQueries();
        } else if (moduleName === 'quotations') {
            setupQuotationTable();
            await Promise.all([
                loadQuotationsEnhanced(),
                loadQueriesForQuotation()
            ]);
        } else if (moduleName === 'purchase-orders') {
            await loadPurchaseOrdersEnhanced();
        } else if (moduleName === 'invoices') {
            setupInvoiceTable();
            await loadInvoicesEnhanced();
        } else if (moduleName === 'admin') {
            showAdminModule();
        }
    } catch (error) {
        console.error(`Error loading ${moduleName} module:`, error);
        showAlert(`Error loading ${getModuleDisplayName(moduleName)}. Please try again.`, 'danger');
    }
}

// Load suggestions for autocomplete
async function loadSuggestions() {
    try {
        const responses = await Promise.all([
            fetch('/api/suggestions/org'),
            fetch('/api/suggestions/client'),
            fetch('/api/suggestions/supplier')
        ]);
        
        // Check if any response failed due to authentication
        if (responses.some(r => r.status === 401)) {
            return; // User not authenticated, skip loading suggestions
        }
        
        const [orgSuggestions, clientSuggestions, supplierSuggestions] = await Promise.all(
            responses.map(r => r.json())
        );
        
        populateDatalist('org-suggestions', orgSuggestions || []);
        populateDatalist('client-suggestions', clientSuggestions || []);
        populateDatalist('supplier-suggestions', supplierSuggestions || []);
    } catch (error) {
        console.error('Error loading suggestions:', error);
    }
}

// Populate datalist with suggestions
function populateDatalist(datalistId, suggestions) {
    const datalist = document.getElementById(datalistId);
    datalist.innerHTML = '';
    suggestions.forEach(suggestion => {
        const option = document.createElement('option');
        option.value = suggestion;
        datalist.appendChild(option);
    });
}

// Global variables for table functionality
let allQueries = [];
let filteredQueries = [];
let currentSortColumn = 'last_submission_date';
let currentSortDirection = 'asc';

// Load queries
async function loadQueries(status = 'pending', deleted = false) {
    try {
        let url = '/api/queries';
        const params = new URLSearchParams();
        
        if (deleted) {
            params.append('deleted', 'true');
        } else if (status) {
            params.append('status', status);
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        console.log('Loading queries from:', url);
        const response = await fetch(url);
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            if (response.status === 401) {
                console.log('Authentication required, redirecting to login');
                redirectToLogin();
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const queries = await response.json();
        console.log('Loaded queries:', queries.length, 'items');
        
        allQueries = queries;
        
        // Sort by last submission date by default (closest dates first)
        sortQueriesByDate(queries);
        filteredQueries = [...queries];
        displayQueriesTable(filteredQueries);
    } catch (error) {
        console.error('Error loading queries:', error);
        showAlert(`Error loading queries: ${error.message}`, 'danger');
    }
}

// Sort queries by last submission date (closest dates first)
function sortQueriesByDate(queries) {
    queries.sort((a, b) => {
        const dateA = new Date(a.last_submission_date);
        const dateB = new Date(b.last_submission_date);
        return dateA - dateB; // Ascending order (closest dates first)
    });
}

// Display queries in table format
function displayQueriesTable(queries) {
    const tableBody = document.getElementById('queries-table-body');
    const emptyState = document.getElementById('queries-empty-state');
    const table = document.getElementById('queries-table');
    
    if (queries.length === 0) {
        table.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    table.style.display = 'table';
    emptyState.style.display = 'none';
    
    tableBody.innerHTML = queries.map(query => createQueryTableRow(query)).join('');
}

// Create query table row
function createQueryTableRow(query) {
    const isUrgent = checkUrgentDeadline(query.last_submission_date);
    const urgentClass = isUrgent ? 'table-danger' : '';
    
    return `
        <tr class="${urgentClass}">
            <td><strong>${query.nsets_case_number}</strong></td>
            <td>${query.client_case_number}</td>
            <td>${query.org_department}</td>
            <td>${formatDate(query.enquiry_date)}</td>
            <td class="${isUrgent ? 'text-danger fw-bold' : ''}">
                ${formatDate(query.last_submission_date)}
                ${isUrgent ? '<i class="fas fa-exclamation-triangle ms-1"></i>' : ''}
            </td>
            <td>${query.query_sent_to}</td>
            <td>
                <span class="status-badge status-${query.status}">${query.status}</span>
            </td>
            <td>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-primary" onclick="viewQuery(${query.id})" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="editQuery(${query.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success" onclick="generateQueryExcel(${query.id})" title="Excel">
                        <i class="fas fa-file-excel"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-info" onclick="printQueryById(${query.id})" title="Print">
                        <i class="fas fa-print"></i>
                    </button>
                    ${query.status === 'pending' ? `
                        <button class="btn btn-sm btn-outline-warning" onclick="showStatusChangeModal(${query.id})" title="Change Status">
                            <i class="fas fa-exchange-alt"></i>
                        </button>
                    ` : ''}
                    ${query.status !== 'deleted' ? `
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteQuery(${query.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `;
}

// Display queries in the dashboard (legacy function for compatibility)
function displayQueries(queries, containerId) {
    displayQueriesTable(queries);
}

// Create query card HTML
function createQueryCard(query) {
    const isUrgent = isDeadlineUrgent(query.last_submission_date);
    const deadlineClass = isUrgent ? 'urgent-deadline' : '';
    const statusClass = query.status === 'submitted' ? 'status-submitted' : 'status-pending';
    
    return `
        <div class="col-lg-6 col-xl-4">
            <div class="card query-card">
                <div class="card-body">
                    <div class="query-header">
                        <div>
                            <div class="case-number">${query.nsets_case_number || 'N/A'}</div>
                            <div class="nsets-case">Client: ${query.client_case_number}</div>
                        </div>
                        <span class="status-badge " + statusClass + "">${query.status}</span>
                    </div>
                    
                    <div class="query-info">
                        <div class="info-item">
                            <span class="info-label">ORG/Department</span>
                            <span class="info-value">${query.org_department}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Enquiry Date</span>
                            <span class="info-value">${formatDate(query.enquiry_date)}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Last Submission Date</span>
                            <span class="info-value " + deadlineClass + "">${formatDate(query.last_submission_date)}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Query Sent To</span>
                            <span class="info-value">${query.query_sent_to}</span>
                        </div>
                    </div>
                    
                    ${query.attachment_path ? `
                        <div class="mb-2">
                            <a href="/${query.attachment_path}" target="_blank" class="attachment-link">
                                <i class="fas fa-paperclip me-1"></i>View Attachment
                            </a>
                        </div>
                    ` : ''}
                    
                    <div class="query-actions">
                        <button class="btn btn-sm btn-outline-primary" onclick="viewQuery(${query.id})">
                            <i class="fas fa-eye me-1"></i>View
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" onclick="editQuery(${query.id})">
                            <i class="fas fa-edit me-1"></i>Edit
                        </button>
                        <button class="btn btn-sm btn-outline-success" onclick="generateQueryExcel(${query.id})">
                            <i class="fas fa-file-excel me-1"></i>Excel
                        </button>
                        ${query.status === 'pending' ? `
                            <button class="btn btn-sm btn-outline-warning" onclick="showStatusChangeModal(${query.id})">
                                <i class="fas fa-exchange-alt me-1"></i>Status
                            </button>
                        ` : ''}
                        ${query.deleted_at ? '' : `
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteQuery(${query.id})">
                                <i class="fas fa-trash me-1"></i>Delete
                            </button>
                        `}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Check if deadline is urgent (5 days or less)
function isDeadlineUrgent(dateString) {
    if (!dateString) return false;
    
    const deadline = new Date(dateString);
    const today = new Date();
    const diffTime = deadline - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays <= 5 && diffDays >= 0;
}

// Check urgent deadline (alias for table functionality)
function checkUrgentDeadline(dateString) {
    return isDeadlineUrgent(dateString);
}

// Search functionality
function searchQueries() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    
    if (!searchTerm) {
        filteredQueries = [...allQueries];
    } else {
        filteredQueries = allQueries.filter(query => {
            return (
                (query.nsets_case_number && query.nsets_case_number.toLowerCase().includes(searchTerm)) ||
                (query.client_name && query.client_name.toLowerCase().includes(searchTerm)) ||
                (query.org_department && query.org_department.toLowerCase().includes(searchTerm)) ||
                (query.query_sent_to && query.query_sent_to.toLowerCase().includes(searchTerm))
            );
        });
    }
    
    displayQueriesTable(filteredQueries);
}

// Sort table by column
function sortTable(column) {
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }
    
    filteredQueries.sort((a, b) => {
        let valueA = a[column] || '';
        let valueB = b[column] || '';
        
        // Handle date columns
        if (column.includes('date')) {
            valueA = new Date(valueA);
            valueB = new Date(valueB);
        } else {
            valueA = valueA.toString().toLowerCase();
            valueB = valueB.toString().toLowerCase();
        }
        
        if (currentSortDirection === 'asc') {
            return valueA > valueB ? 1 : -1;
        } else {
            return valueA < valueB ? 1 : -1;
        }
    });
    
    displayQueriesTable(filteredQueries);
    updateSortIcons();
}

// Update sort icons
function updateSortIcons() {
    // Remove all existing sort icons
    document.querySelectorAll('.sort-icon').forEach(icon => {
        icon.className = 'sort-icon fas fa-sort';
    });
    
    // Add appropriate icon for current sort column
    const currentIcon = document.querySelector(`[data-column="${currentSortColumn}"] .sort-icon`);
    if (currentIcon) {
        currentIcon.className = `sort-icon fas fa-sort-${currentSortDirection === 'asc' ? 'up' : 'down'}`;
    }
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
}

// Show query form
function showQueryForm(queryId = null) {
    currentQueryId = queryId;
    document.getElementById('query-dashboard').classList.add('d-none');
    document.getElementById('query-form-container').classList.remove('d-none');
    
    if (queryId) {
        document.getElementById('form-title').textContent = 'Edit Query';
        loadQueryForEdit(queryId);
    } else {
        document.getElementById('form-title').textContent = 'New Query';
        resetQueryForm();
    }
}

// Hide query form
function hideQueryForm() {
    document.getElementById('query-dashboard').classList.remove('d-none');
    document.getElementById('query-form-container').classList.add('d-none');
    resetQueryForm();
    currentQueryId = null;
}

// Reset query form
function resetQueryForm() {
    document.getElementById('query-form').reset();
    document.getElementById('query-id').value = '';
    document.getElementById('items-tbody').innerHTML = '';
    
    // Clear supplier tags
    const suppliersTagsContainer = document.getElementById('suppliers-tags');
    if (suppliersTagsContainer) {
        suppliersTagsContainer.innerHTML = '';
    }
    const hiddenInput = document.getElementById('query-sent-to');
    if (hiddenInput) {
        hiddenInput.value = '';
    }
    
    itemCounter = 0;
    setDefaultDates();
}

// Load query for editing
async function loadQueryForEdit(queryId) {
    try {
        const response = await fetch(`/api/queries/${queryId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const query = await response.json();
        
        console.log('Loaded query data:', query);
        console.log('Query items:', query.items);
        
        // Populate form fields
        document.getElementById('query-id').value = query.id;
        document.getElementById('org-department').value = query.org_department || '';
        document.getElementById('client-case-number').value = query.client_case_number || '';
        document.getElementById('date').value = query.date || '';
        document.getElementById('last-submission-date').value = query.last_submission_date || '';
        document.getElementById('client-name').value = query.client_name || '';
        
        // Load supplier tags
        loadExistingSupplierTags(query.query_sent_to || '');
        
        document.getElementById('status').value = query.status || 'pending';
        document.getElementById('nsets-case-number').value = query.nsets_case_number || '';
        document.getElementById('enquiry-date').value = query.enquiry_date || '';
        document.getElementById('last-submission-excel-date').value = query.last_submission_excel_date || '';
        
        // Load items
        const tbody = document.getElementById('items-tbody');
        tbody.innerHTML = '';
        itemCounter = 0;
        
        if (query.items && Array.isArray(query.items) && query.items.length > 0) {
            query.items.forEach(item => {
                console.log('Adding item row:', item);
                addItemRow(item);
            });
        } else {
            console.warn('No items found or items is not an array:', query.items);
        }
    } catch (error) {
        console.error('Error loading query for edit:', error);
        showAlert('Error loading query data', 'danger');
    }
}

// Handle query form submission
async function handleQuerySubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    
    // Collect items data
    const items = [];
    const rows = document.querySelectorAll('#items-tbody tr');
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input, select');
        const item = {
            manufacturer_number: inputs[0].value,
            stockist_number: inputs[1].value,
            coo: inputs[2].value,
            brand: inputs[3].value,
            description: inputs[4].value,
            au: inputs[5].value,
            quantity: parseInt(inputs[6].value) || 0,
            remarks: inputs[7].value
        };
        items.push(item);
    });
    
    formData.append('items', JSON.stringify(items));
    
    try {
        let url = '/api/queries';
        let method = 'POST';
        
        if (currentQueryId) {
            url += `/${currentQueryId}`;
            method = 'PUT';
        }
        
        const response = await fetch(url, {
            method: method,
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert(currentQueryId ? 'Query updated successfully' : 'Query created successfully', 'success');
            hideQueryForm();
            loadQueries();
            loadSuggestions(); // Reload suggestions
        } else {
            showAlert(result.error || 'Error saving query', 'danger');
        }
    } catch (error) {
        console.error('Error submitting query:', error);
        showAlert('Error submitting query', 'danger');
    }
}

// Add item row to table
function addItem(itemData = null) {
    addItemRow(itemData);
}

// Helper function to escape HTML for attribute values
function escapeHtml(unsafe) {
    if (unsafe == null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Add item row with data
function addItemRow(itemData = null) {
    itemCounter++;
    const tbody = document.getElementById('items-tbody');
    const row = document.createElement('tr');
    
    row.innerHTML = `
        <td class="serial-number">${itemCounter}</td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.manufacturer_number || '')}" placeholder="Manufacturer#"></td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.stockist_number || '')}" placeholder="Stockist#"></td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.coo || '')}" placeholder="COO"></td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.brand || '')}" placeholder="Brand"></td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.description || '')}" placeholder="Description"></td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.au || '')}" placeholder="A/U"></td>
        <td><input type="number" class="form-control form-control-sm" value="${escapeHtml(itemData?.quantity || '')}" placeholder="Qty" min="0"></td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.remarks || '')}" placeholder="Remarks"></td>
        <td>
            <button type="button" class="btn btn-sm btn-outline-danger delete-row-btn" onclick="deleteItemRow(this)">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    
    tbody.appendChild(row);
    updateSerialNumbers();
}

// Delete item row
function deleteItemRow(button) {
    button.closest('tr').remove();
    updateSerialNumbers();
}

// Update serial numbers after row deletion
function updateSerialNumbers() {
    const rows = document.querySelectorAll('#items-tbody tr');
    rows.forEach((row, index) => {
        row.querySelector('.serial-number').textContent = index + 1;
    });
    itemCounter = rows.length;
}

// View query details
async function viewQuery(queryId) {
    try {
        const response = await fetch(`/api/queries/${queryId}`);
        const query = await response.json();
        
        const modalContent = document.getElementById('query-detail-content');
        modalContent.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>Basic Information</h6>
                    <table class="table table-sm">
                        <tr><td><strong>ORG/Department:</strong></td><td>${query.org_department}</td></tr>
                        <tr><td><strong>Client Case Number:</strong></td><td>${query.client_case_number}</td></tr>
                        <tr><td><strong>Date:</strong></td><td>${formatDate(query.date)}</td></tr>
                        <tr><td><strong>Last Submission Date:</strong></td><td>${formatDate(query.last_submission_date)}</td></tr>
                        <tr><td><strong>Client Name:</strong></td><td>${query.client_name}</td></tr>
                        <tr><td><strong>Query Sent To:</strong></td><td>${query.query_sent_to}</td></tr>
                        <tr><td><strong>Status:</strong></td><td><span class="badge bg-" + (query.status === 'submitted' ? 'success' : 'warning') + "">${query.status}</span></td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6>Datasheet Information</h6>
                    <table class="table table-sm">
                        <tr><td><strong>NSETS Case Number:</strong></td><td>${query.nsets_case_number}</td></tr>
                        <tr><td><strong>Enquiry Date:</strong></td><td>${formatDate(query.enquiry_date)}</td></tr>
                        <tr><td><strong>Last Submission (Excel):</strong></td><td>${formatDate(query.last_submission_excel_date)}</td></tr>
                    </table>
                    ${query.attachment_path ? `
                        <div class="mt-3">
                            <h6>Attachment</h6>
                            <a href="/${query.attachment_path}" target="_blank" class="btn btn-sm btn-outline-primary">
                                <i class="fas fa-paperclip me-1"></i>View Attachment
                            </a>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            ${query.items && query.items.length > 0 ? `
                <div class="mt-4">
                    <h6>Items</h6>
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead class="table-dark">
                                <tr>
                                    <th>Serial#</th>
                                    ${query.items.some(item => item.manufacturer_number) ? '<th>Manufacturer#</th>' : ''}
                                    ${query.items.some(item => item.stockist_number) ? '<th>Stockist#</th>' : ''}
                                    ${query.items.some(item => item.coo) ? '<th>COO</th>' : ''}
                                    ${query.items.some(item => item.brand) ? '<th>Brand</th>' : ''}
                                    ${query.items.some(item => item.description) ? '<th>Description</th>' : ''}
                                    ${query.items.some(item => item.au) ? '<th>A/U</th>' : ''}
                                    ${query.items.some(item => item.quantity) ? '<th>Quantity</th>' : ''}
                                    ${query.items.some(item => item.remarks) ? '<th>Remarks</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${query.items.map(item => `
                                    <tr>
                                        <td>${item.serial_number}</td>
                                        ${query.items.some(i => i.manufacturer_number) ? '<td>' + (item.manufacturer_number || '') + '</td>' : ''}
                                        ${query.items.some(i => i.stockist_number) ? '<td>' + (item.stockist_number || '') + '</td>' : ''}
                                        ${query.items.some(i => i.coo) ? '<td>' + (item.coo || '') + '</td>' : ''}
                                        ${query.items.some(i => i.brand) ? '<td>' + (item.brand || '') + '</td>' : ''}
                                        ${query.items.some(i => i.description) ? '<td>' + (item.description || '') + '</td>' : ''}
                                        ${query.items.some(i => i.au) ? '<td>' + (item.au || '') + '</td>' : ''}
                                        ${query.items.some(i => i.quantity) ? '<td>' + (item.quantity || '') + '</td>' : ''}
                                        ${query.items.some(i => i.remarks) ? '<td>' + (item.remarks || '') + '</td>' : ''}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}
            
            ${query.supplier_responses && query.supplier_responses.length > 0 ? `
                <div class="mt-4">
                    <h6>Supplier Responses</h6>
                    <div class="row">
                        ${query.supplier_responses.map(response => `
                            <div class="col-md-6 mb-3">
                                <div class="card">
                                    <div class="card-header">
                                        <h6 class="mb-0">${response.supplier_name}</h6>
                                    </div>
                                    <div class="card-body">
                                        <p class="mb-2">
                                            <strong>Response:</strong> 
                                            <span class="badge bg-" + (response.response_status === 'yes' ? 'success' : 'secondary') + "">
                                                ${response.response_status === 'yes' ? 'Response Received' : 'No Response'}
                                            </span>
                                        </p>
                                        ${response.attachment_path ? `
                                            <p class="mb-0">
                                                <strong>Attachment:</strong>
                                                <a href="/${response.attachment_path}" target="_blank" class="btn btn-sm btn-outline-primary ms-2">
                                                    <i class="fas fa-paperclip me-1"></i>View File
                                                </a>
                                            </p>
                                        ` : ''}
                                        <small class="text-muted">Submitted: ${formatDate(response.created_at)}</small>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <div class="mt-4" id="related-documents-query"></div>
        `;

        loadRelatedDocumentsForQuery(queryId);
        
        const modal = new bootstrap.Modal(document.getElementById('queryDetailModal'));
        modal.show();
    } catch (error) {
        console.error('Error loading query details:', error);
        showAlert('Error loading query details', 'danger');
    }
}

function renderRelatedDocumentsSection(title, blocksHtml) {
    return `
        <h6>${title}</h6>
        <div class="d-flex flex-wrap gap-2">
            ${blocksHtml || '<span class="text-muted">No related documents</span>'}
        </div>
    `;
}

function relatedButton(label, onClick, variant = 'outline-secondary') {
    return `<button type="button" class="btn btn-sm btn-${variant}" onclick="${onClick}">${label}</button>`;
}

function goToQuery(queryId) {
    showModule('queries');
    setTimeout(() => viewQuery(queryId), 200);
}

function goToQuotation(quotationId) {
    showModule('quotations');
    setTimeout(() => viewQuotation(quotationId), 200);
}

function goToPurchaseOrder(poId) {
    showModule('purchase-orders');
    setTimeout(() => viewPurchaseOrder(poId), 200);
}

function goToInvoice(invoiceId) {
    showModule('invoices');
    setTimeout(() => viewInvoice(invoiceId), 200);
}

async function loadRelatedDocumentsForQuery(queryId) {
    const container = document.getElementById('related-documents-query');
    if (!container) return;
    container.innerHTML = '<div class="text-muted">Loading related documents...</div>';

    try {
        const resp = await fetch(`/api/queries/${queryId}/related`, { credentials: 'include' });
        const data = await resp.json();
        if (!resp.ok) {
            container.innerHTML = `<div class="text-danger">${escapeHtml(data.error || 'Failed to load related documents')}</div>`;
            return;
        }

        const qButtons = (data.quotations || []).map(q => relatedButton(`Quotation: ${escapeHtml(q.quotation_number || ('#' + q.id))}`, `goToQuotation(${q.id})`, 'outline-primary')).join('');
        const poButtons = (data.purchaseOrders || []).map(po => relatedButton(`PO: ${escapeHtml(po.po_number || ('#' + po.id))}`, `goToPurchaseOrder(${po.id})`, 'outline-success')).join('');
        const invButtons = (data.invoices || []).map(inv => relatedButton(`Invoice: ${escapeHtml(inv.invoice_number || ('#' + inv.id))}`, `goToInvoice(${inv.id})`, 'outline-dark')).join('');

        const blocks = [
            qButtons ? `<div class="me-3">${renderRelatedDocumentsSection('Quotations', qButtons)}</div>` : '',
            poButtons ? `<div class="me-3">${renderRelatedDocumentsSection('Purchase Orders', poButtons)}</div>` : '',
            invButtons ? `<div class="me-3">${renderRelatedDocumentsSection('Invoices', invButtons)}</div>` : ''
        ].filter(Boolean).join('');

        container.innerHTML = blocks || renderRelatedDocumentsSection('Related Documents', '');
    } catch (e) {
        console.error('Error loading related docs for query:', e);
        container.innerHTML = '<div class="text-danger">Failed to load related documents</div>';
    }
}

// Edit query
function editQuery(queryId) {
    showQueryForm(queryId);
}

// Delete query
async function deleteQuery(queryId) {
    if (!confirm('Are you sure you want to delete this query? It will be moved to the deleted queries section.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/queries/${queryId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert('Query deleted successfully', 'success');
            loadQueries();
        } else {
            showAlert(result.error || 'Error deleting query', 'danger');
        }
    } catch (error) {
        console.error('Error deleting query:', error);
        showAlert('Error deleting query', 'danger');
    }
}

// Generate Excel for query
function generateQueryExcel(queryId) {
    window.open(`/api/queries/${queryId}/excel`, '_blank');
}

// Generate Excel from current form
function generateExcel() {
    if (!currentQueryId) {
        showAlert('Please save the query first before generating Excel', 'warning');
        return;
    }
    generateQueryExcel(currentQueryId);
}

// Show alert message
function showAlert(message, type = 'info') {
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll('.alert-custom');
    existingAlerts.forEach(alert => alert.remove());
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show alert-custom`;
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '20px';
    alertDiv.style.right = '20px';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.minWidth = '300px';
    
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// Tag Input System Functions

// Setup tag input functionality
function setupTagInput() {
    const supplierInput = document.getElementById('supplier-input');
    
    if (supplierInput) {
        supplierInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addSupplierTag();
            }
        });
    }
}

// Add supplier tag
function addSupplierTag() {
    const input = document.getElementById('supplier-input');
    const tagText = input.value.trim();
    
    if (tagText === '') {
        return;
    }
    
    const tagsContainer = document.getElementById('suppliers-tags');
    const hiddenInput = document.getElementById('query-sent-to');
    
    // Check if tag already exists
    const existingTags = Array.from(tagsContainer.querySelectorAll('.supplier-tag')).map(tag => 
        tag.textContent.replace('×', '').trim()
    );
    
    if (existingTags.includes(tagText)) {
        input.value = '';
        return;
    }
    
    // Create tag element
    const tagElement = document.createElement('span');
    tagElement.className = 'supplier-tag';
    tagElement.innerHTML = `
        ${tagText}
        <button type="button" class="remove-tag" onclick="removeSupplierTag(this)">
            ×
        </button>
    `;
    
    tagsContainer.appendChild(tagElement);
    
    // Update hidden input value
    updateSuppliersValue();
    
    // Clear input
    input.value = '';
}

// Remove supplier tag
function removeSupplierTag(button) {
    const tagElement = button.parentElement;
    tagElement.remove();
    
    // Update hidden input value
    updateSuppliersValue();
}

// Update hidden input with current supplier tags
function updateSuppliersValue() {
    const tagsContainer = document.getElementById('suppliers-tags');
    const hiddenInput = document.getElementById('query-sent-to');
    
    const tags = Array.from(tagsContainer.querySelectorAll('.supplier-tag')).map(tag => 
        tag.textContent.replace('×', '').trim()
    );
    
    hiddenInput.value = tags.join(', ');
}

// Load existing supplier tags
function loadExistingSupplierTags(tagsString) {
    if (!tagsString) return;
    
    const tagsContainer = document.getElementById('suppliers-tags');
    const tags = tagsString.split(',').filter(tag => tag.trim() !== '');
    
    tagsContainer.innerHTML = '';
    
    tags.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.className = 'supplier-tag';
        tagElement.innerHTML = `
            ${tag.trim()}
            <button type="button" class="remove-tag" onclick="removeSupplierTag(this)">
                ×
            </button>
        `;
        tagsContainer.appendChild(tagElement);
    });
    
    updateSuppliersValue();
}

// Search and Filter Functions

// Initialize search functionality
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('query-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(performSearch, 300));
    }
});

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Perform search
function performSearch() {
    const searchTerm = document.getElementById('query-search').value.toLowerCase().trim();
    const statusFilter = document.getElementById('status-filter').value;
    
    let searchResults = [...allQueries];
    
    // Apply status filter
    if (statusFilter !== 'all') {
        if (statusFilter === 'deleted') {
            searchResults = searchResults.filter(query => query.deleted_at !== null);
        } else {
            searchResults = searchResults.filter(query => query.status === statusFilter && query.deleted_at === null);
        }
    }
    
    // Apply search filter
    if (searchTerm) {
        searchResults = searchResults.filter(query => {
            return (
                (query.nsets_case_number && query.nsets_case_number.toLowerCase().includes(searchTerm)) ||
                (query.client_case_number && query.client_case_number.toLowerCase().includes(searchTerm)) ||
                (query.client_name && query.client_name.toLowerCase().includes(searchTerm)) ||
                (query.org_department && query.org_department.toLowerCase().includes(searchTerm)) ||
                (query.query_sent_to && query.query_sent_to.toLowerCase().includes(searchTerm))
            );
        });
    }
    
    filteredQueries = searchResults;
    displayQueriesTable(filteredQueries);
}

// Clear search
function clearSearch() {
    document.getElementById('query-search').value = '';
    document.getElementById('status-filter').value = 'all';
    performSearch();
}

// Filter queries by status
function filterQueries() {
    performSearch();
}

// Load all queries (updated to load all statuses)
async function loadAllQueries() {
    try {
        console.log('Loading all queries...');
        const [pendingResponse, submittedResponse, deletedResponse] = await Promise.all([
            fetch('/api/queries?status=pending'),
            fetch('/api/queries?status=submitted'),
            fetch('/api/queries?status=deleted')
        ]);
        
        console.log('Response statuses:', {
            pending: pendingResponse.status,
            submitted: submittedResponse.status,
            deleted: deletedResponse.status
        });
        
        // Check if any response failed due to authentication
        if ([pendingResponse, submittedResponse, deletedResponse].some(r => r.status === 401)) {
            console.log('Authentication required, redirecting to login');
            redirectToLogin();
            return;
        }
        
        // Check for other errors
        if ([pendingResponse, submittedResponse, deletedResponse].some(r => !r.ok)) {
            const errorResponses = [pendingResponse, submittedResponse, deletedResponse]
                .filter(r => !r.ok)
                .map(r => `${r.status}: ${r.statusText}`);
            throw new Error(`Failed to load queries: ${errorResponses.join(', ')}`);
        }
        
        const [pendingQueries, submittedQueries, deletedQueries] = await Promise.all([
            pendingResponse.json(),
            submittedResponse.json(),
            deletedResponse.json()
        ]);
        
        console.log('Loaded query counts:', {
            pending: pendingQueries?.length || 0,
            submitted: submittedQueries?.length || 0,
            deleted: deletedQueries?.length || 0
        });
        
        allQueries = [...(pendingQueries || []), ...(submittedQueries || []), ...(deletedQueries || [])];
        
        // Sort by last submission date by default (closest dates first)
        sortQueriesByDate(allQueries);
        
        // Apply default filter (pending queries)
        performSearch();
    } catch (error) {
        console.error('Error loading queries:', error);
        showAlert(`Error loading queries: ${error.message}`, 'danger');
    }
}

// Quotation Management Functions

let currentQuotationId = null;
let quotationItemCounter = 0;

// Load quotations
async function loadQuotations() {
    try {
        const response = await fetch('/api/quotations');
        const quotations = await response.json();
        displayQuotations(quotations);
    } catch (error) {
        console.error('Error loading quotations:', error);
        showAlert('Error loading quotations', 'danger');
    }
}

// Display quotations in table format
function displayQuotations(quotations) {
    const tableBody = document.getElementById('quotations-table-body');
    const emptyState = document.getElementById('quotations-empty-state');
    const table = document.getElementById('quotations-table');
    
    if (quotations.length === 0) {
        table.style.display = 'none';
        emptyState.classList.remove('d-none');
        return;
    }
    
    table.style.display = 'table';
    emptyState.classList.add('d-none');
    tableBody.innerHTML = quotations.map(quotation => createQuotationTableRow(quotation)).join('');
}

// Create quotation table row
function createQuotationTableRow(quotation) {
    const isAdmin = !!(currentUser && currentUser.role === 'admin');
    return `
        <tr>
            <td>${quotation.quotation_number || 'N/A'}</td>
            <td>${formatDate(quotation.date)}</td>
            <td>${quotation.to_client || 'N/A'}</td>
            <td><span class="badge bg-primary">${quotation.currency}</span></td>
            <td><strong>${quotation.currency} ${quotation.grand_total || '0.00'}</strong></td>
            <td>
                <div class="btn-group" role="group">
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="viewQuotation(${quotation.id})" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" onclick="editQuotation(${quotation.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${isAdmin ? `
                        <button type="button" class="btn btn-sm btn-outline-warning" onclick="approveQuotationToInvoice(${quotation.id})" title="Approve to Invoice">
                            <i class="fas fa-check"></i>
                        </button>
                    ` : ''}
                    <button type="button" class="btn btn-sm btn-outline-success" onclick="generateQuotationExcelById(${quotation.id})" title="Generate Excel">
                        <i class="fas fa-file-excel"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-info" onclick="printQuotationById(${quotation.id})" title="Print">
                        <i class="fas fa-print"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteQuotation(${quotation.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// Load queries for quotation dropdown
async function loadQueriesForQuotation() {
    try {
        const response = await fetch('/api/queries/for-quotation');
        const queries = await response.json();
        
        const select = document.getElementById('linked-query');
        const tenderCaseNoInput = document.getElementById('tender-case-no');
        if (!select) return;
        select.innerHTML = '<option value="">Select Query</option>';
        
        if (Array.isArray(queries)) {
            queries.forEach(query => {
                const option = document.createElement('option');
                option.value = query.id;
                option.textContent = (query.nsets_case_number || '') + ' - ' + (query.client_name || '');
                option.dataset.caseNumber = query.nsets_case_number || '';
                select.appendChild(option);
            });
        }

        select.onchange = () => {
            if (!tenderCaseNoInput) return;
            if (tenderCaseNoInput.value) return;
            const selected = select.options[select.selectedIndex];
            if (selected && selected.dataset.caseNumber) {
                tenderCaseNoInput.value = selected.dataset.caseNumber;
            }
        };
    } catch (error) {
        console.error('Error loading queries for quotation:', error);
    }
}

// Show quotation form
function showQuotationForm(quotationId = null) {
    currentQuotationId = quotationId;
    document.getElementById('quotation-dashboard').classList.add('d-none');
    document.getElementById('quotation-form-container').classList.remove('d-none');
    
    if (quotationId) {
        document.getElementById('quotation-form-title').textContent = 'Edit Quotation';
        loadQuotationForEdit(quotationId);
    } else {
        document.getElementById('quotation-form-title').textContent = 'New Quotation';
        resetQuotationForm();
    }
}

// Hide quotation form
function hideQuotationForm() {
    document.getElementById('quotation-dashboard').classList.remove('d-none');
    document.getElementById('quotation-form-container').classList.add('d-none');
    resetQuotationForm();
    currentQuotationId = null;
}

// Reset quotation form
function resetQuotationForm() {
    document.getElementById('quotation-form').reset();
    document.getElementById('quotation-id').value = '';
    document.getElementById('quotation-items-tbody').innerHTML = '';
    quotationItemCounter = 0;
    
    // Set default date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('quotation-date').value = today;
    
    // Set default quotation type to local
    document.getElementById('quotation-type').value = 'local';

    const tenderCaseNoInput = document.getElementById('tender-case-no');
    if (tenderCaseNoInput) tenderCaseNoInput.value = '';
    
    // Initialize GST/Freight display
    toggleGSTFreight();
    
    // Reset totals
    updateTotalDisplays(0, 0, 0);
}

// Load quotation for editing
async function loadQuotationForEdit(quotationId) {
    try {
        const response = await fetch(`/api/quotations/${quotationId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const quotation = await response.json();
        
        console.log('Loaded quotation data:', quotation);
        console.log('Quotation items:', quotation.items);

        const quotationIdInput = document.getElementById('quotation-id');
        if (quotationIdInput) quotationIdInput.value = quotation.id;
        const tenderCaseNoInput = document.getElementById('tender-case-no');
        if (tenderCaseNoInput) tenderCaseNoInput.value = quotation.tender_case_no || '';
        const quotationNumberInput = document.getElementById('quotation-number');
        if (quotationNumberInput) quotationNumberInput.value = quotation.quotation_number || '';
        const quotationDateInput = document.getElementById('quotation-date');
        if (quotationDateInput) quotationDateInput.value = quotation.date || '';
        const toClientInput = document.getElementById('to-client');
        if (toClientInput) toClientInput.value = quotation.to_client || '';
        const linkedQuerySelect = document.getElementById('linked-query');
        if (linkedQuerySelect) linkedQuerySelect.value = quotation.query_id || '';
        const currencySelect = document.getElementById('currency');
        if (currencySelect) currencySelect.value = quotation.currency || 'USD';
        const quotationTypeSelect = document.getElementById('quotation-type');
        if (quotationTypeSelect) quotationTypeSelect.value = quotation.quotation_type || 'local';
        
        // Initialize GST/Freight display based on quotation type
        toggleGSTFreight();
        
        // Removed supplier-price, profit-factor, and exchange-rate form fields
        
        // Load items
        const tbody = document.getElementById('quotation-items-tbody');
        tbody.innerHTML = '';
        quotationItemCounter = 0;
        
        if (quotation.items && Array.isArray(quotation.items) && quotation.items.length > 0) {
            quotation.items.forEach(item => {
                console.log('Adding quotation item row:', item);
                addQuotationItemRow(item);
            });
        } else {
            console.warn('No items found or items is not an array:', quotation.items);
        }
        
        // Update totals
        updateTotalDisplays(
            quotation.total_without_gst || 0,
            quotation.gst_amount || 0,
            quotation.grand_total || 0
        );
    } catch (error) {
        console.error('Error loading quotation for edit:', error);
        showAlert('Error loading quotation data', 'danger');
    }
}

// Add quotation item
function addQuotationItem(itemData = null) {
    addQuotationItemRow(itemData);
}

// Add quotation item row
function addQuotationItemRow(itemData = null) {
    quotationItemCounter++;
    const tbody = document.getElementById('quotation-items-tbody');
    const row = document.createElement('tr');
    
    row.innerHTML = `
        <td class="serial-number">${quotationItemCounter}</td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.manufacturer_number || '')}" placeholder="Manufacturer#"></td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.stockist_number || '')}" placeholder="Stockist#"></td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.coo || '')}" placeholder="COO"></td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.brand || '')}" placeholder="Brand"></td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.description || '')}" placeholder="Description"></td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.au || '')}" placeholder="A/U"></td>
        <td><input type="number" class="form-control form-control-sm quantity-input" value="${escapeHtml(itemData?.quantity || '')}" placeholder="Qty" min="0" onchange="calculateRowTotal(this)"></td>
        <td><input type="number" class="form-control form-control-sm unit-price-input" value="${escapeHtml(itemData?.unit_price || '')}" placeholder="U/P" step="0.01" min="0" onchange="calculateRowTotal(this)"></td>
        <td><input type="number" class="form-control form-control-sm total-price-input" value="${escapeHtml(itemData?.total_price || '')}" placeholder="T/P" step="0.01" readonly></td>
        <td><input type="number" class="form-control form-control-sm supplier-price-input" value="${escapeHtml(itemData?.supplier_price || '')}" placeholder="Supplier U/P" step="0.01" min="0" onchange="calculateSupplierUP(this)"></td>
        <td><input type="number" class="form-control form-control-sm profit-factor-input" value="${escapeHtml(itemData?.profit_factor || '')}" placeholder="Profit Factor" step="0.01" min="0" onchange="calculateSupplierUP(this)"></td>
        <td><input type="number" class="form-control form-control-sm exchange-rate-input" value="${escapeHtml(itemData?.exchange_rate || '')}" placeholder="Exchange Rate" step="0.01" min="0" onchange="calculateSupplierUP(this)"></td>
        <td><input type="number" class="form-control form-control-sm supplier-up-input" value="${escapeHtml(itemData?.supplier_up || '')}" placeholder="Calculated Price" step="0.01" readonly></td>
        <td>
            <button type="button" class="btn btn-sm btn-outline-danger delete-row-btn" onclick="deleteQuotationItemRow(this)">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    
    tbody.appendChild(row);
    updateQuotationSerialNumbers();
    
    // Calculate initial supplier U/P if data is provided
    if (itemData?.supplier_price && itemData?.profit_factor && itemData?.exchange_rate) {
        const supplierUP = itemData.supplier_price * itemData.profit_factor * itemData.exchange_rate;
        row.querySelector('.supplier-up-input').value = supplierUP.toFixed(2);
    }
}

// Calculate supplier U/P for a row
function calculateSupplierUP(input) {
    const row = input.closest('tr');
    const supplierPrice = parseFloat(row.querySelector('.supplier-price-input').value) || 0;
    const profitFactor = parseFloat(row.querySelector('.profit-factor-input').value) || 0;
    const exchangeRate = parseFloat(row.querySelector('.exchange-rate-input').value) || 0;
    
    const supplierUP = supplierPrice * profitFactor * exchangeRate;
    row.querySelector('.supplier-up-input').value = supplierUP.toFixed(2);
}

// Delete quotation item row
function deleteQuotationItemRow(button) {
    button.closest('tr').remove();
    updateQuotationSerialNumbers();
    calculateTotals();
}

// Update serial numbers
function updateQuotationSerialNumbers() {
    const rows = document.querySelectorAll('#quotation-items-tbody tr');
    rows.forEach((row, index) => {
        row.querySelector('.serial-number').textContent = index + 1;
    });
    quotationItemCounter = rows.length;
}

// Calculate row total
function calculateRowTotal(input) {
    const row = input.closest('tr');
    const quantity = parseFloat(row.querySelector('.quantity-input').value) || 0;
    const unitPrice = parseFloat(row.querySelector('.unit-price-input').value) || 0;
    const totalPrice = quantity * unitPrice;
    
    row.querySelector('.total-price-input').value = totalPrice.toFixed(2);
    calculateTotals();
}

// Toggle between GST and Freight modes
function toggleGSTFreight() {
    const quotationTypeElement = document.getElementById('quotation-type');
    const gstFreightRow = document.getElementById('gst-freight-row');
    const totalLabel = document.getElementById('total-label') || document.getElementById('total-without-gst-label');
    const gstFreightLabel = document.getElementById('gst-freight-label') || document.getElementById('gst-amount-label');

    if (!quotationTypeElement || !gstFreightRow) {
        calculateTotals();
        return;
    }

    const quotationType = quotationTypeElement.value;

    if (quotationType === 'foreign') {
        gstFreightRow.innerHTML = `
            <td><strong>Freight:</strong></td>
            <td>
                <input type="number" id="freight-amount-input" class="form-control" 
                       step="0.01" min="0" value="0" onchange="calculateTotals()" style="width: 120px;">
            </td>`;
        if (totalLabel) totalLabel.textContent = 'Total without Freight:';
        if (gstFreightLabel) gstFreightLabel.textContent = 'Freight Amount:';
    } else {
        gstFreightRow.innerHTML = `
            <td><strong>GST (18%):</strong></td>
            <td>
                <span id="gst-amount">0.00</span>
                <input type="hidden" id="gst-amount-input" name="gst_amount" value="0">
            </td>`;
        if (totalLabel) totalLabel.textContent = 'Total without GST:';
        if (gstFreightLabel) gstFreightLabel.textContent = 'GST (18%):';
    }
    
    calculateTotals();
}

// Calculate totals
function calculateTotals() {
    const rows = document.querySelectorAll('#quotation-items-tbody tr');
    let totalWithoutGstFreight = 0;
    
    rows.forEach(row => {
        const totalPrice = parseFloat(row.querySelector('.total-price-input').value) || 0;
        totalWithoutGstFreight += totalPrice;
    });
    
    const quotationType = document.getElementById('quotation-type').value;
    let gstFreightAmount = 0;
    
    if (quotationType === 'foreign') {
        // For foreign quotations, use manual freight input
        const freightInput = document.getElementById('freight-amount-input');
        gstFreightAmount = freightInput ? parseFloat(freightInput.value) || 0 : 0;
    } else {
        // For local quotations, calculate 18% GST
        gstFreightAmount = totalWithoutGstFreight * 0.18;
    }
    
    const grandTotal = totalWithoutGstFreight + gstFreightAmount;
    
    updateTotalDisplays(totalWithoutGstFreight, gstFreightAmount, grandTotal);
}

// Update total displays
function updateTotalDisplays(totalWithoutGstFreight, gstFreightAmount, grandTotal) {
    document.getElementById('total-without-gst').textContent = totalWithoutGstFreight.toFixed(2);
    document.getElementById('grand-total').textContent = grandTotal.toFixed(2);
    
    document.getElementById('total-without-gst-input').value = totalWithoutGstFreight.toFixed(2);
    document.getElementById('grand-total-input').value = grandTotal.toFixed(2);
    
    // Update GST or Freight amount based on quotation type
    const quotationType = document.getElementById('quotation-type').value;
    if (quotationType === 'foreign') {
        // For foreign quotations, the freight input handles its own value
        const freightInput = document.getElementById('freight-amount-input');
        if (freightInput && !document.activeElement === freightInput) {
            freightInput.value = gstFreightAmount.toFixed(2);
        }
        // Update hidden input for form submission
        let gstAmountInput = document.getElementById('gst-amount-input');
        if (gstAmountInput) {
            gstAmountInput.value = gstFreightAmount.toFixed(2);
        }
    } else {
        // For local quotations, update GST display
        const gstAmountSpan = document.getElementById('gst-amount');
        if (gstAmountSpan) {
            gstAmountSpan.textContent = gstFreightAmount.toFixed(2);
        }
        const gstAmountInput = document.getElementById('gst-amount-input');
        if (gstAmountInput) {
            gstAmountInput.value = gstFreightAmount.toFixed(2);
        }
    }
}

// Handle quotation form submission
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('quotation-form').addEventListener('submit', handleQuotationSubmit);
});

async function handleQuotationSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    
    // Collect items data
    const items = [];
    const rows = document.querySelectorAll('#quotation-items-tbody tr');
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const item = {
            manufacturer_number: inputs[0].value,
            stockist_number: inputs[1].value,
            coo: inputs[2].value,
            brand: inputs[3].value,
            description: inputs[4].value,
            au: inputs[5].value,
            quantity: parseInt(inputs[6].value) || 0,
            unit_price: parseFloat(inputs[7].value) || 0,
            total_price: parseFloat(inputs[8].value) || 0,
            supplier_price: parseFloat(inputs[9].value) || 0,
            profit_factor: parseFloat(inputs[10].value) || 0,
            exchange_rate: parseFloat(inputs[11].value) || 0,
            supplier_up: parseFloat(inputs[12].value) || 0
        };
        items.push(item);
    });
    
    // Prepare data object
    const data = {
        tender_case_no: formData.get('tender_case_no'),
        quotation_number: formData.get('quotation_number'),
        date: formData.get('date'),
        to_client: formData.get('to_client'),
        query_id: formData.get('query_id') || null,
        currency: formData.get('currency'),
        quotation_type: formData.get('quotation_type') || 'local',
        attachment: formData.get('quotation_attachment') ? formData.get('quotation_attachment').name : null,
        supplier_price: 0,
        profit_factor: 0,
        exchange_rate: 0,
        total_without_gst: parseFloat(formData.get('total_without_gst')) || 0,
        gst_amount: parseFloat(formData.get('gst_amount')) || 0,
        grand_total: parseFloat(formData.get('grand_total')) || 0,
        items: items
    };
    
    try {
        let url = '/api/quotations';
        let method = 'POST';
        
        if (currentQuotationId) {
            url += `/${currentQuotationId}`;
            method = 'PUT';
        }
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert(currentQuotationId ? 'Quotation updated successfully' : 'Quotation created successfully', 'success');
            hideQuotationForm();
            loadQuotationsEnhanced();
        } else {
            showAlert(result.error || 'Error saving quotation', 'danger');
        }
    } catch (error) {
        console.error('Error submitting quotation:', error);
        showAlert('Error submitting quotation', 'danger');
    }
}

// View quotation
async function viewQuotation(quotationId) {
    try {
        const response = await fetch(`/api/quotations/${quotationId}`);
        const quotation = await response.json();
        
        const modalContent = document.getElementById('query-detail-content');
        modalContent.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>Quotation Information</h6>
                    <table class="table table-sm">
                        <tr><td><strong>Tender No/Case No:</strong></td><td>${quotation.tender_case_no || ''}</td></tr>
                        <tr><td><strong>Quotation Number:</strong></td><td>${quotation.quotation_number}</td></tr>
                        <tr><td><strong>Date:</strong></td><td>${formatDate(quotation.date)}</td></tr>
                        <tr><td><strong>To:</strong></td><td>${quotation.to_client}</td></tr>
                        <tr><td><strong>Currency:</strong></td><td>${quotation.currency}</td></tr>
                    </table>
                </div>

            </div>
            
            ${quotation.items && quotation.items.length > 0 ? `
                <div class="mt-4">
                    <h6>Items</h6>
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead class="table-dark">
                                <tr>
                                    <th>Serial#</th>
                                    ${quotation.items.some(item => item.manufacturer_number) ? '<th>Manufacturer#</th>' : ''}
                                    ${quotation.items.some(item => item.stockist_number) ? '<th>Stockist#</th>' : ''}
                                    ${quotation.items.some(item => item.coo) ? '<th>COO</th>' : ''}
                                    ${quotation.items.some(item => item.brand) ? '<th>Brand</th>' : ''}
                                    ${quotation.items.some(item => item.description) ? '<th>Description</th>' : ''}
                                    ${quotation.items.some(item => item.au) ? '<th>A/U</th>' : ''}
                                    ${quotation.items.some(item => item.quantity) ? '<th>Quantity</th>' : ''}
                                    ${quotation.items.some(item => item.unit_price) ? '<th>U/P</th>' : ''}
                                    ${quotation.items.some(item => item.total_price) ? '<th>T/P</th>' : ''}
                                    ${quotation.items.some(item => item.supplier_price) ? '<th>Supplier U/P</th>' : ''}
                                    ${quotation.items.some(item => item.profit_factor) ? '<th>Profit Factor</th>' : ''}
                                    ${quotation.items.some(item => item.exchange_rate) ? '<th>Exchange Rate</th>' : ''}
                                    ${quotation.items.some(item => item.supplier_up) ? '<th>Calculated Price</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${quotation.items.map(item => `
                                    <tr>
                                        <td>${item.serial_number}</td>
                                        ${quotation.items.some(i => i.manufacturer_number) ? '<td>' + (item.manufacturer_number || '') + '</td>' : ''}
                                        ${quotation.items.some(i => i.stockist_number) ? '<td>' + (item.stockist_number || '') + '</td>' : ''}
                                        ${quotation.items.some(i => i.coo) ? '<td>' + (item.coo || '') + '</td>' : ''}
                                        ${quotation.items.some(i => i.brand) ? '<td>' + (item.brand || '') + '</td>' : ''}
                                        ${quotation.items.some(i => i.description) ? '<td>' + (item.description || '') + '</td>' : ''}
                                        ${quotation.items.some(i => i.au) ? '<td>' + (item.au || '') + '</td>' : ''}
                                        ${quotation.items.some(i => i.quantity) ? '<td>' + (item.quantity || '') + '</td>' : ''}
                                        ${quotation.items.some(i => i.unit_price) ? '<td>' + (item.unit_price || '') + '</td>' : ''}
                                        ${quotation.items.some(i => i.total_price) ? '<td>' + (item.total_price || '') + '</td>' : ''}
                                        ${quotation.items.some(i => i.supplier_price) ? '<td>' + (item.supplier_price || '') + '</td>' : ''}
                                        ${quotation.items.some(i => i.profit_factor) ? '<td>' + (item.profit_factor || '') + '</td>' : ''}
                                        ${quotation.items.some(i => i.exchange_rate) ? '<td>' + (item.exchange_rate || '') + '</td>' : ''}
                                        ${quotation.items.some(i => i.supplier_up) ? '<td>' + (item.supplier_up || '') + '</td>' : ''}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}
                    
                    <div class="row mt-3">
                        <div class="col-md-8"></div>
                        <div class="col-md-4">
                            <table class="table table-sm">
                                <tr><td><strong>Total without GST:</strong></td><td>${quotation.total_without_gst || '0.00'}</td></tr>
                                <tr><td><strong>GST Amount:</strong></td><td>${quotation.gst_amount || '0.00'}</td></tr>
                                <tr class="table-primary"><td><strong>Grand Total:</strong></td><td><strong>${quotation.grand_total || '0.00'}</strong></td></tr>
                            </table>
                        </div>
                    </div>

                    <div class="mt-4" id="related-documents-quotation"></div>
                </div>
            `;

        loadRelatedDocumentsForQuotation(quotationId);
        
        const modal = new bootstrap.Modal(document.getElementById('queryDetailModal'));
        modal.show();
    } catch (error) {
        console.error('Error loading quotation details:', error);
        showAlert('Error loading quotation details', 'danger');
    }
}

async function loadRelatedDocumentsForQuotation(quotationId) {
    const container = document.getElementById('related-documents-quotation');
    if (!container) return;
    container.innerHTML = '<div class="text-muted">Loading related documents...</div>';

    try {
        const resp = await fetch(`/api/quotations/${quotationId}/related`, { credentials: 'include' });
        const data = await resp.json();
        if (!resp.ok) {
            container.innerHTML = `<div class="text-danger">${escapeHtml(data.error || 'Failed to load related documents')}</div>`;
            return;
        }

        const queryButton = data.query
            ? relatedButton(`Query: ${escapeHtml(data.query.nsets_case_number || ('#' + data.query.id))}`, `goToQuery(${data.query.id})`, 'outline-primary')
            : '';
        const poButtons = (data.purchaseOrders || []).map(po => relatedButton(`PO: ${escapeHtml(po.po_number || ('#' + po.id))}`, `goToPurchaseOrder(${po.id})`, 'outline-success')).join('');
        const invButtons = (data.invoices || []).map(inv => relatedButton(`Invoice: ${escapeHtml(inv.invoice_number || ('#' + inv.id))}`, `goToInvoice(${inv.id})`, 'outline-dark')).join('');

        const blocks = [
            queryButton ? `<div class="me-3">${renderRelatedDocumentsSection('Query', queryButton)}</div>` : '',
            poButtons ? `<div class="me-3">${renderRelatedDocumentsSection('Purchase Orders', poButtons)}</div>` : '',
            invButtons ? `<div class="me-3">${renderRelatedDocumentsSection('Invoices', invButtons)}</div>` : ''
        ].filter(Boolean).join('');

        container.innerHTML = blocks || renderRelatedDocumentsSection('Related Documents', '');
    } catch (e) {
        console.error('Error loading related docs for quotation:', e);
        container.innerHTML = '<div class="text-danger">Failed to load related documents</div>';
    }
}

// Edit quotation
function editQuotation(quotationId) {
    showQuotationForm(quotationId);
}

// Delete quotation
async function deleteQuotation(quotationId) {
    if (!confirm('Are you sure you want to delete this quotation?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/quotations/' + quotationId, {
            method: 'DELETE',
            credentials: 'include',
            headers: csrfToken ? { 'x-csrf-token': csrfToken } : {}
        });

        let result = null;
        try {
            result = await response.json();
        } catch {
            result = null;
        }
        
        if (response.ok) {
            showAlert('Quotation deleted successfully', 'success');
            loadQuotationsEnhanced();
        } else {
            showAlert((result && result.error) || `Error deleting quotation (HTTP ${response.status})`, 'danger');
        }
    } catch (error) {
        console.error('Error deleting quotation:', error);
        showAlert('Error deleting quotation', 'danger');
    }
}

async function approveQuotationToInvoice(quotationId) {
    if (!confirm('Approve this quotation and create an invoice copy?')) {
        return;
    }

    try {
        const response = await fetch(`/api/quotations/${quotationId}/approve-to-invoice`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
            },
            body: JSON.stringify({})
        });

        const result = await response.json();
        if (!response.ok) {
            showAlert(result.error || 'Failed to approve quotation', 'danger');
            return;
        }

        showAlert('Invoice created from quotation', 'success');
        showModule('invoices');
        setTimeout(() => {
            try {
                showInvoiceForm(result.invoiceId);
            } catch (e) {
                console.error('Failed to open invoice form:', e);
                loadInvoices();
            }
        }, 200);
    } catch (error) {
        console.error('Error approving quotation:', error);
        showAlert('Error approving quotation', 'danger');
    }
}

// Generate Excel for quotation by ID
function generateQuotationExcelById(quotationId) {
    window.open('/api/quotations/' + quotationId + '/excel', '_blank');
}

// Generate Excel from current quotation form
function generateQuotationExcel() {
    if (!currentQuotationId) {
        showAlert('Please save the quotation first before generating Excel', 'warning');
        return;
    }
    generateQuotationExcelById(currentQuotationId);
}

// Quotation Table Functionality
let quotationSortColumn = 'date';
let quotationSortDirection = 'desc';
let allQuotations = [];

// Setup quotation table functionality
function setupQuotationTable() {
    // Search functionality
    const searchInput = document.getElementById('quotation-search');
    if (searchInput) {
        searchInput.addEventListener('input', filterQuotations);
    }

    // Currency filter
    const currencyFilter = document.getElementById('quotation-currency-filter');
    if (currencyFilter) {
        currencyFilter.addEventListener('change', filterQuotations);
    }

    // Sorting functionality
    const sortableHeaders = document.querySelectorAll('#quotations-table .sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-sort');
            sortQuotations(column);
        });
    });
}

// Filter quotations based on search and filters
function filterQuotations() {
    const searchTerm = document.getElementById('quotation-search').value.toLowerCase();
    const currencyFilter = document.getElementById('quotation-currency-filter').value;

    let filteredQuotations = allQuotations.filter(quotation => {
        const matchesSearch = !searchTerm || 
            (quotation.quotation_number && quotation.quotation_number.toLowerCase().includes(searchTerm)) ||
            (quotation.to_client && quotation.to_client.toLowerCase().includes(searchTerm)) ||
            (quotation.client_name && quotation.client_name.toLowerCase().includes(searchTerm));
        
        const matchesCurrency = !currencyFilter || quotation.currency === currencyFilter;
        
        return matchesSearch && matchesCurrency;
    });

    displayQuotations(filteredQuotations);
}

// Sort quotations
function sortQuotations(column) {
    if (quotationSortColumn === column) {
        quotationSortDirection = quotationSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        quotationSortColumn = column;
        quotationSortDirection = 'asc';
    }

    allQuotations.sort((a, b) => {
        let aVal = a[column] || '';
        let bVal = b[column] || '';

        // Handle different data types
        if (column === 'date') {
            aVal = new Date(aVal);
            bVal = new Date(bVal);
        } else if (column === 'grand_total') {
            aVal = parseFloat(aVal) || 0;
            bVal = parseFloat(bVal) || 0;
        } else {
            aVal = aVal.toString().toLowerCase();
            bVal = bVal.toString().toLowerCase();
        }

        if (aVal < bVal) return quotationSortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return quotationSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    updateQuotationSortIcons();
    filterQuotations();
}

// Update sort icons
function updateQuotationSortIcons() {
    const headers = document.querySelectorAll('#quotations-table .sortable');
    headers.forEach(header => {
        const icon = header.querySelector('.sort-icon');
        const column = header.getAttribute('data-sort');
        
        if (column === quotationSortColumn) {
            icon.className = quotationSortDirection === 'asc' ? 'fas fa-sort-up sort-icon' : 'fas fa-sort-down sort-icon';
        } else {
            icon.className = 'fas fa-sort sort-icon';
        }
    });
}

// Clear quotation filters
function clearQuotationFilters() {
    document.getElementById('quotation-search').value = '';
    document.getElementById('quotation-currency-filter').value = '';
    filterQuotations();
}

// Enhanced load quotations function
async function loadQuotationsEnhanced() {
    try {
        const response = await fetch('/api/quotations');
        const quotations = await response.json();
        allQuotations = quotations;
        sortQuotations(quotationSortColumn);
    } catch (error) {
        console.error('Error loading quotations:', error);
        showAlert('Error loading quotations', 'danger');
    }
}

// Purchase Order Management
let currentPurchaseOrderId = null;
let poItemCounter = 0;
let allPurchaseOrders = [];
let poSortColumn = 'date';
let poSortDirection = 'desc';

// Load purchase orders
async function loadPurchaseOrders() {
    try {
        const response = await fetch('/api/purchase-orders');
        const purchaseOrders = await response.json();
        allPurchaseOrders = purchaseOrders;
        displayPurchaseOrders(purchaseOrders);
    } catch (error) {
        console.error('Error loading purchase orders:', error);
        showAlert('Error loading purchase orders', 'danger');
    }
}

// Display purchase orders in table
function displayPurchaseOrders(purchaseOrders) {
    const tbody = document.getElementById('purchase-orders-table-body');
    const emptyState = document.getElementById('purchase-orders-empty-state');
    
    if (!purchaseOrders || purchaseOrders.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('d-none');
        return;
    }
    
    emptyState.classList.add('d-none');
    tbody.innerHTML = purchaseOrders.map(po => createPurchaseOrderTableRow(po)).join('');
}

// Get currency symbol from currency code
function getCurrencySymbol(currencyCode) {
    const currencyMap = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'INR': '₹',
        'JPY': '¥',
        'CNY': '¥',
        'AUD': 'A$',
        'CAD': 'C$'
    };
    return currencyMap[currencyCode] || currencyCode;
}

// Create purchase order table row
function createPurchaseOrderTableRow(po) {
    const currencySymbol = getCurrencySymbol(po.po_currency || 'INR');
    return `
        <tr>
            <td>${po.po_number}</td>
            <td>${formatDate(po.date)}</td>
            <td>${po.supplier_name}</td>
            <td class="text-end">${currencySymbol}${parseFloat(po.grand_total || 0).toFixed(2)}</td>
            <td>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-primary" onclick="viewPurchaseOrder(${po.id})" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="editPurchaseOrder(${po.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deletePurchaseOrder(${po.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success" onclick="generatePurchaseOrderExcel(${po.id})" title="Generate Excel">
                        <i class="fas fa-file-excel"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success" onclick="printPurchaseOrderById(${po.id})" title="Print">
                        <i class="fas fa-print"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// Show purchase order form
function showPurchaseOrderForm(poId = null) {
    currentPurchaseOrderId = poId;
    document.getElementById('purchase-order-dashboard').classList.add('d-none');
    document.getElementById('purchase-order-form-container').classList.remove('d-none');
    
    if (poId) {
        document.getElementById('purchase-order-form-title').textContent = 'Edit Purchase Order';
        loadPurchaseOrderForEdit(poId);
    } else {
        document.getElementById('purchase-order-form-title').textContent = 'New Purchase Order';
        resetPurchaseOrderForm();
    }
}

// Hide purchase order form
function hidePurchaseOrderForm() {
    document.getElementById('purchase-order-form-container').classList.add('d-none');
    document.getElementById('purchase-order-dashboard').classList.remove('d-none');
    resetPurchaseOrderForm();
}

// Reset purchase order form
function resetPurchaseOrderForm() {
    document.getElementById('purchase-order-form').reset();
    document.getElementById('purchase-order-id').value = '';
    document.getElementById('po-items-tbody').innerHTML = '';
    document.getElementById('po-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('po-currency').value = 'INR';
    poItemCounter = 0;
    updatePOCurrencyDisplay();
    calculatePOTotals();
    addPurchaseOrderItem(); // Add one default row
}

// Load purchase order for editing
async function loadPurchaseOrderForEdit(poId) {
    try {
        const response = await fetch(`/api/purchase-orders/${poId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const po = await response.json();
        
        console.log('Loaded purchase order data:', po);
        console.log('Purchase order items:', po.items);

        const poIdInput = document.getElementById('purchase-order-id');
        if (poIdInput) poIdInput.value = po.id;
        const poNumberInput = document.getElementById('po-number');
        if (poNumberInput) poNumberInput.value = po.po_number;
        const poDateInput = document.getElementById('po-date');
        if (poDateInput) poDateInput.value = po.date;
        const poSubjectInput = document.getElementById('po-subject');
        if (poSubjectInput) poSubjectInput.value = po.subject || '';
        const supplierNameInput = document.getElementById('supplier-name');
        if (supplierNameInput) supplierNameInput.value = po.supplier_name;
        const supplierAddressInput = document.getElementById('supplier-address');
        if (supplierAddressInput) supplierAddressInput.value = po.supplier_address;
        const poCurrencySelect = document.getElementById('po-currency');
        if (poCurrencySelect) poCurrencySelect.value = po.po_currency || 'INR';
        const freightChargesInput = document.getElementById('freight-charges');
        if (freightChargesInput) freightChargesInput.value = po.freight_charges || 0;
        updatePOCurrencyDisplay();
        
        // Load items
        document.getElementById('po-items-tbody').innerHTML = '';
        poItemCounter = 0;
        
        if (po.items && Array.isArray(po.items) && po.items.length > 0) {
            po.items.forEach(item => {
                console.log('Adding purchase order item row:', item);
                addPurchaseOrderItemRow(item);
            });
        } else {
            console.warn('No items found or items is not an array:', po.items);
            addPurchaseOrderItem();
        }
        
        calculatePOTotals();
    } catch (error) {
        console.error('Error loading purchase order:', error);
        showAlert('Error loading purchase order', 'danger');
    }
}

// Add purchase order item
function addPurchaseOrderItem(itemData = null) {
    addPurchaseOrderItemRow(itemData);
}

// Add purchase order item row
function addPurchaseOrderItemRow(itemData = null) {
    poItemCounter++;
    const tbody = document.getElementById('po-items-tbody');
    const row = document.createElement('tr');
    
    row.innerHTML = `
        <td class="serial-number">${poItemCounter}</td>
        <td><input type="text" class="form-control" name="manufacturer_number" value="${escapeHtml(itemData?.manufacturer_number || '')}" placeholder="Manufacturer #"></td>
        <td><input type="text" class="form-control" name="stockist_number" value="${escapeHtml(itemData?.stockist_number || '')}" placeholder="Stockist #"></td>
        <td><input type="text" class="form-control" name="coo" value="${escapeHtml(itemData?.coo || '')}" placeholder="COO"></td>
        <td><input type="text" class="form-control" name="brand" value="${escapeHtml(itemData?.brand || '')}" placeholder="Brand"></td>
        <td><input type="text" class="form-control" name="description" value="${escapeHtml(itemData?.description || '')}" placeholder="Description"></td>
        <td><input type="text" class="form-control" name="au" value="${escapeHtml(itemData?.au || '')}" placeholder="A/U"></td>
        <td><input type="number" class="form-control" name="quantity" value="${escapeHtml(itemData?.quantity || '')}" placeholder="Qty" onchange="calculatePORowTotal(this)"></td>
        <td><input type="number" class="form-control po-unit-price-input" name="unit_price" value="${escapeHtml(itemData?.unit_price || '')}" placeholder="U/P" step="0.01" onchange="calculatePORowTotal(this)"></td>
        <td><input type="number" class="form-control" name="total_price" value="${escapeHtml(itemData?.total_price || '')}" placeholder="T/P" step="0.01" readonly></td>
        <td><input type="text" class="form-control" name="delivery_time" value="${escapeHtml(itemData?.delivery_time || '')}" placeholder="Delivery Time"></td>
        <td><input type="text" class="form-control" name="remarks" value="${escapeHtml(itemData?.remarks || '')}" placeholder="Remarks"></td>
        <td>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="deletePurchaseOrderItemRow(this)">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    
    tbody.appendChild(row);
    
    if (itemData?.total_price) {
        calculatePOTotals();
    }
}

// Calculate purchase order row total
function calculatePORowTotal(input) {
    const row = input.closest('tr');
    const quantity = parseFloat(row.querySelector('input[name="quantity"]').value) || 0;
    const unitPrice = parseFloat(row.querySelector('input[name="unit_price"]').value) || 0;
    const totalPrice = quantity * unitPrice;
    
    row.querySelector('input[name="total_price"]').value = totalPrice.toFixed(2);
    calculatePOTotals();
}

// Update purchase order currency display
function updatePOCurrencyDisplay() {
    const currencySelect = document.getElementById('po-currency');
    const selectedOption = currencySelect.options[currencySelect.selectedIndex];
    const currencySymbol = selectedOption.getAttribute('data-symbol');
    
    // Update all currency symbols
    document.getElementById('po-currency-symbol').textContent = currencySymbol;
    document.getElementById('freight-currency-symbol').textContent = currencySymbol;
    document.getElementById('grand-total-currency-symbol').textContent = currencySymbol;
}

// Calculate purchase order totals
function calculatePOTotals() {
    const rows = document.querySelectorAll('#po-items-tbody tr');
    let totalPrice = 0;
    
    rows.forEach(row => {
        const rowTotal = parseFloat(row.querySelector('input[name="total_price"]').value) || 0;
        totalPrice += rowTotal;
    });
    
    const freightCharges = parseFloat(document.getElementById('freight-charges').value) || 0;
    const grandTotal = totalPrice + freightCharges;
    
    document.getElementById('po-total-price').textContent = totalPrice.toFixed(2);
    document.getElementById('po-grand-total').textContent = grandTotal.toFixed(2);
}

// Delete purchase order item row
function deletePurchaseOrderItemRow(button) {
    button.closest('tr').remove();
    updatePOSerialNumbers();
    calculatePOTotals();
}

// Update purchase order serial numbers
function updatePOSerialNumbers() {
    const rows = document.querySelectorAll('#po-items-tbody tr');
    rows.forEach((row, index) => {
        row.querySelector('.serial-number').textContent = index + 1;
    });
    poItemCounter = rows.length;
}

// Handle purchase order form submission
document.addEventListener('DOMContentLoaded', function() {
    const poForm = document.getElementById('purchase-order-form');
    if (poForm) {
        poForm.addEventListener('submit', handlePurchaseOrderSubmit);
    }
    
    // Add event listener for freight charges
    const freightChargesInput = document.getElementById('freight-charges');
    if (freightChargesInput) {
        freightChargesInput.addEventListener('input', calculatePOTotals);
    }
});

async function handlePurchaseOrderSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const poId = formData.get('purchase-order-id');
    
    // Collect items data
    const items = [];
    const rows = document.querySelectorAll('#po-items-tbody tr');
    
    rows.forEach((row, index) => {
        const item = {
            serial_number: index + 1,
            manufacturer_number: row.querySelector('input[name="manufacturer_number"]').value,
            stockist_number: row.querySelector('input[name="stockist_number"]').value,
            coo: row.querySelector('input[name="coo"]').value,
            brand: row.querySelector('input[name="brand"]').value,
            description: row.querySelector('input[name="description"]').value,
            au: row.querySelector('input[name="au"]').value,
            quantity: parseFloat(row.querySelector('input[name="quantity"]').value) || 0,
            unit_price: parseFloat(row.querySelector('input[name="unit_price"]').value) || 0,
            total_price: parseFloat(row.querySelector('input[name="total_price"]').value) || 0,
            delivery_time: row.querySelector('input[name="delivery_time"]').value,
            remarks: row.querySelector('input[name="remarks"]').value
        };
        
        if (item.description || item.manufacturer_number || item.stockist_number) {
            items.push(item);
        }
    });
    
    const totalPrice = parseFloat(document.getElementById('po-total-price').textContent) || 0;
    const freightCharges = parseFloat(formData.get('freight_charges')) || 0;
    const grandTotal = totalPrice + freightCharges;
    
    const purchaseOrderData = {
        po_number: formData.get('po_number'),
        date: formData.get('date'),
        subject: formData.get('subject'),
        supplier_name: formData.get('supplier_name'),
        supplier_address: formData.get('supplier_address'),
        po_currency: formData.get('po_currency') || 'INR',
        total_price: totalPrice,
        freight_charges: freightCharges,
        grand_total: grandTotal,
        items: items
    };
    
    try {
        const url = poId ? `/api/purchase-orders/${poId}` : '/api/purchase-orders';
        const method = poId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
            },
            body: JSON.stringify(purchaseOrderData)
        });
        
        if (response.ok) {
            showAlert(poId ? 'Purchase order updated successfully!' : 'Purchase order created successfully!', 'success');
            hidePurchaseOrderForm();
            loadPurchaseOrders();
        } else {
            const error = await response.json();
            showAlert('Error saving purchase order: ' + error.error, 'danger');
        }
    } catch (error) {
        console.error('Error saving purchase order:', error);
        showAlert('Error saving purchase order', 'danger');
    }
}

// View purchase order
async function viewPurchaseOrder(poId) {
    try {
        const response = await fetch(`/api/purchase-orders/${poId}`);
        const po = await response.json();
        
        const modalContent = document.getElementById('purchase-order-detail-content');
        modalContent.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>Purchase Order Information</h6>
                    <table class="table table-sm">
                        <tr><td><strong>PO Number:</strong></td><td>${po.po_number}</td></tr>
                        <tr><td><strong>Date:</strong></td><td>${formatDate(po.date)}</td></tr>
                        <tr><td><strong>Subject:</strong></td><td>${po.subject || ''}</td></tr>
                        <tr><td><strong>Supplier Name:</strong></td><td>${po.supplier_name}</td></tr>
                        <tr><td><strong>Supplier Address:</strong></td><td>${po.supplier_address}</td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6>Financial Summary</h6>
                    <table class="table table-sm">
                        <tr><td><strong>Currency:</strong></td><td>${po.po_currency || 'INR'}</td></tr>
                        <tr><td><strong>Total Price:</strong></td><td>${getCurrencySymbol(po.po_currency || 'INR')}${parseFloat(po.total_price || 0).toFixed(2)}</td></tr>
                        <tr><td><strong>Freight Charges:</strong></td><td>${getCurrencySymbol(po.po_currency || 'INR')}${parseFloat(po.freight_charges || 0).toFixed(2)}</td></tr>
                        <tr><td><strong>Grand Total:</strong></td><td><strong>${getCurrencySymbol(po.po_currency || 'INR')}${parseFloat(po.grand_total || 0).toFixed(2)}</strong></td></tr>
                    </table>
                </div>
            </div>
            
            ${po.items && po.items.length > 0 ? `
                <div class="mt-4">
                    <h6>Items</h6>
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead class="table-dark">
                                <tr>
                                    <th>Sr No.</th>
                                    ${po.items.some(item => item.manufacturer_number) ? '<th>Manufacturer #</th>' : ''}
                                    ${po.items.some(item => item.stockist_number) ? '<th>Stockist #</th>' : ''}
                                    ${po.items.some(item => item.coo) ? '<th>COO</th>' : ''}
                                    ${po.items.some(item => item.brand) ? '<th>Brand</th>' : ''}
                                    ${po.items.some(item => item.description) ? '<th>Description</th>' : ''}
                                    ${po.items.some(item => item.au) ? '<th>A/U</th>' : ''}
                                    ${po.items.some(item => item.quantity) ? '<th>Quantity</th>' : ''}
                                    ${po.items.some(item => item.unit_price && parseFloat(item.unit_price) > 0) ? '<th>U/P</th>' : ''}
                                    ${po.items.some(item => item.total_price && parseFloat(item.total_price) > 0) ? '<th>T/P</th>' : ''}
                                    ${po.items.some(item => item.delivery_time) ? '<th>Delivery Time</th>' : ''}
                                    ${po.items.some(item => item.remarks) ? '<th>Remarks</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${po.items.map(item => `
                                    <tr>
                                        <td>${item.serial_number}</td>
                                        ${po.items.some(i => i.manufacturer_number) ? '<td>' + (item.manufacturer_number || '') + '</td>' : ''}
                                        ${po.items.some(i => i.stockist_number) ? '<td>' + (item.stockist_number || '') + '</td>' : ''}
                                        ${po.items.some(i => i.coo) ? '<td>' + (item.coo || '') + '</td>' : ''}
                                        ${po.items.some(i => i.brand) ? '<td>' + (item.brand || '') + '</td>' : ''}
                                        ${po.items.some(i => i.description) ? '<td>' + (item.description || '') + '</td>' : ''}
                                        ${po.items.some(i => i.au) ? '<td>' + (item.au || '') + '</td>' : ''}
                                        ${po.items.some(i => i.quantity) ? '<td>' + (item.quantity || '') + '</td>' : ''}
                                        ${po.items.some(i => i.unit_price && parseFloat(i.unit_price) > 0) ? '<td>$' + parseFloat(item.unit_price || 0).toFixed(2) + '</td>' : ''}
                                        ${po.items.some(i => i.total_price && parseFloat(i.total_price) > 0) ? '<td>$' + parseFloat(item.total_price || 0).toFixed(2) + '</td>' : ''}
                                        ${po.items.some(i => i.delivery_time) ? '<td>' + (item.delivery_time || '') + '</td>' : ''}
                                        ${po.items.some(i => i.remarks) ? '<td>' + (item.remarks || '') + '</td>' : ''}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : '<div class="mt-4"><p class="text-muted">No items found.</p></div>'}

            <div class="mt-4" id="related-documents-po"></div>
        `;

        loadRelatedDocumentsForPurchaseOrder(poId);
        
        const modal = new bootstrap.Modal(document.getElementById('purchaseOrderDetailModal'));
        modal.show();
    } catch (error) {
        console.error('Error loading purchase order:', error);
        showAlert('Error loading purchase order details', 'danger');
    }
}

async function loadRelatedDocumentsForPurchaseOrder(poId) {
    const container = document.getElementById('related-documents-po');
    if (!container) return;
    container.innerHTML = '<div class="text-muted">Loading related documents...</div>';

    try {
        const resp = await fetch(`/api/purchase-orders/${poId}/related`, { credentials: 'include' });
        const data = await resp.json();
        if (!resp.ok) {
            container.innerHTML = `<div class="text-danger">${escapeHtml(data.error || 'Failed to load related documents')}</div>`;
            return;
        }

        const queryButton = data.query
            ? relatedButton(`Query: ${escapeHtml(data.query.nsets_case_number || ('#' + data.query.id))}`, `goToQuery(${data.query.id})`, 'outline-primary')
            : '';
        const quotationButton = data.quotation
            ? relatedButton(`Quotation: ${escapeHtml(data.quotation.quotation_number || ('#' + data.quotation.id))}`, `goToQuotation(${data.quotation.id})`, 'outline-secondary')
            : '';
        const invButtons = (data.invoices || []).map(inv => relatedButton(`Invoice: ${escapeHtml(inv.invoice_number || ('#' + inv.id))}`, `goToInvoice(${inv.id})`, 'outline-dark')).join('');

        const blocks = [
            queryButton ? `<div class="me-3">${renderRelatedDocumentsSection('Query', queryButton)}</div>` : '',
            quotationButton ? `<div class="me-3">${renderRelatedDocumentsSection('Quotation', quotationButton)}</div>` : '',
            invButtons ? `<div class="me-3">${renderRelatedDocumentsSection('Invoices', invButtons)}</div>` : ''
        ].filter(Boolean).join('');

        container.innerHTML = blocks || renderRelatedDocumentsSection('Related Documents', '');
    } catch (e) {
        console.error('Error loading related docs for PO:', e);
        container.innerHTML = '<div class="text-danger">Failed to load related documents</div>';
    }
}

// Edit purchase order
function editPurchaseOrder(poId) {
    showPurchaseOrderForm(poId);
}

// Delete purchase order
async function deletePurchaseOrder(poId) {
    if (!confirm('Are you sure you want to delete this purchase order?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/purchase-orders/${poId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showAlert('Purchase order deleted successfully!', 'success');
            loadPurchaseOrders();
        } else {
            const error = await response.json();
            showAlert('Error deleting purchase order: ' + error.error, 'danger');
        }
    } catch (error) {
        console.error('Error deleting purchase order:', error);
        showAlert('Error deleting purchase order', 'danger');
    }
}

// Generate Excel for purchase order
function generatePurchaseOrderExcel(poId) {
    window.open(`/api/purchase-orders/${poId}/excel`, '_blank');
}

// Print purchase order by ID
function printPurchaseOrderById(poId) {
    viewPurchaseOrder(poId);
    setTimeout(() => {
        printPurchaseOrder(poId);
    }, 1000); // Increased timeout to ensure modal content is loaded
}

// Print purchase order
async function printPurchaseOrder(poId) {
    try {
        // Fetch purchase order data
        const response = await fetch(`/api/purchase-orders/${poId}`);
        const po = await response.json();
        
        if (!po) {
            showAlert('Purchase order data not found.', 'danger');
            return;
        }
        
        const currencySymbol = getCurrencySymbol(po.po_currency || 'INR');
        
        // Extract data from fetched purchase order
        const poNumber = po.po_number;
        const poDate = formatDate(po.date);
        const supplier = po.supplier_name;
        const supplierAddress = po.supplier_address;
        
        // Generate items HTML from purchase order items
        let itemsHtml = '';
        let totalAmount = parseFloat(po.total_price || 0);
        
        if (po.items && po.items.length > 0) {
            po.items.forEach(item => {
                const qty = parseFloat(item.quantity) || 0;
                const rate = parseFloat(item.unit_price) || 0;
                const amount = parseFloat(item.total_price) || 0;
                
                itemsHtml += `
                    <tr>
                        <td>${item.description || ''}</td>
                        <td style="text-align: center;">${qty}</td>
                        <td style="text-align: right;">${currencySymbol}${rate.toFixed(2)}</td>
                        <td style="text-align: right;">${currencySymbol}${amount.toFixed(2)}</td>
                    </tr>
                `;
            });
        }
        
        // Use actual freight charges and grand total from purchase order
        const freightCharges = parseFloat(po.freight_charges || 0);
        const grandTotal = parseFloat(po.grand_total || 0);
        
        const printWindow = window.open('', '_blank');
        
        if (!printWindow) {
            showAlert('Print popup was blocked. Please allow popups for this site and try again.', 'warning');
            return;
        }
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Purchase Order - ${poNumber}</title>
                <style>
                    @page {
                        margin: 1in;
                    }
                    body {
                        font-family: Arial, sans-serif;
                        font-size: 12px;
                        line-height: 1.4;
                        margin: 0;
                        padding: 20px;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 30px;
                        border-bottom: 2px solid #333;
                        padding-bottom: 15px;
                    }
                    .po-info {
                        margin-bottom: 20px;
                    }
                    .po-info div {
                        margin-bottom: 8px;
                        font-size: 14px;
                    }
                    .po-number {
                        font-weight: bold;
                        font-size: 16px;
                    }
                    .items-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 20px;
                    }
                    .items-table th, .items-table td {
                        padding: 10px;
                        border: 1px solid #333;
                        text-align: left;
                    }
                    .items-table th {
                        background-color: #f8f9fa;
                        font-weight: bold;
                        text-align: center;
                    }
                    .totals-table {
                        width: 300px;
                        margin-left: auto;
                        border-collapse: collapse;
                        margin-top: 20px;
                    }
                    .totals-table td {
                        padding: 8px 12px;
                        border: 1px solid #333;
                    }
                    .totals-table .label {
                        font-weight: bold;
                        background-color: #f8f9fa;
                    }
                    .totals-table .amount {
                        text-align: right;
                    }
                    .grand-total {
                        font-weight: bold;
                        background-color: #e9ecef;
                    }
                    @media print {
                        body {
                            padding: 0;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>PURCHASE ORDER</h1>
                </div>
                
                <div class="po-info">
                    <div class="po-number">PO# ${poNumber}</div>
                    <div><strong>Date:</strong> ${poDate}</div>
                    <div><strong>Currency:</strong> ${po.po_currency || 'INR'}</div>
                    <div><strong>To:</strong></div>
                    <div style="margin-left: 20px;">${supplier}</div>
                    <div style="margin-left: 20px;">${supplierAddress || ''}</div>
                </div>
                
                <table class="items-table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Quantity</th>
                            <th>Rate</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
                
                <table class="totals-table">
                        <tr>
                            <td class="label">Total Amount:</td>
                            <td class="amount">${currencySymbol}${totalAmount.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td class="label">Freight Charges:</td>
                            <td class="amount">${currencySymbol}${freightCharges.toFixed(2)}</td>
                        </tr>
                        <tr class="grand-total">
                            <td class="label">Grand Total:</td>
                            <td class="amount">${currencySymbol}${grandTotal.toFixed(2)}</td>
                        </tr>
                    </table>
            </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 100);
        
    } catch (error) {
        console.error('Print error:', error);
        showAlert('An error occurred while printing. Please try again.', 'danger');
    }
}

// Print query functions
function printQueryById(queryId) {
    viewQuery(queryId);
    setTimeout(() => {
        printQuery();
    }, 1000);
}

function printQuery() {
    try {
        const printContentElement = document.getElementById('query-detail-content');
        
        if (!printContentElement) {
            showAlert('Print content not found. Please try again.', 'danger');
            return;
        }
        
        const printContent = printContentElement.innerHTML;
        
        if (!printContent || printContent.trim() === '') {
            showAlert('No content to print. Please ensure the query is loaded.', 'warning');
            return;
        }
        
        const printWindow = window.open('', '_blank');
        
        if (!printWindow) {
            showAlert('Print popup was blocked. Please allow popups for this site and try again.', 'warning');
            return;
        }
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Query Details</title>
                <style>
                    @page {
                        margin: 1.65in 0.75in 1in 0.75in;
                    }
                    body {
                        font-family: Arial, sans-serif;
                        font-size: 12px;
                        line-height: 1.4;
                    }
                    .table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 1rem;
                    }
                    .table th, .table td {
                        padding: 8px;
                        border: 1px solid #dee2e6;
                        text-align: left;
                    }
                    .table-dark th {
                        background-color: #343a40;
                        color: white;
                    }
                    .table-striped tbody tr:nth-of-type(odd) {
                        background-color: rgba(0,0,0,.05);
                    }
                    h6 {
                        margin-top: 1.5rem;
                        margin-bottom: 0.5rem;
                        font-weight: bold;
                    }
                    .text-end {
                        text-align: right;
                    }
                    @media print {
                        .no-print {
                            display: none;
                        }
                    }
                </style>
            </head>
            <body>
                <div style="text-align: center; margin-bottom: 2rem;">
                    <h1>Query Details</h1>
                </div>
                ${printContent}
            </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 100);
        
    } catch (error) {
        console.error('Print error:', error);
        showAlert('An error occurred while printing. Please try again.', 'danger');
    }
}

// Print quotation functions
function printQuotationById(quotationId) {
    viewQuotation(quotationId);
    setTimeout(() => {
        printQuotation();
    }, 1000);
}

function printQuotation() {
    try {
        const printContentElement = document.getElementById('quotation-detail-content');
        
        if (!printContentElement) {
            showAlert('Print content not found. Please try again.', 'danger');
            return;
        }
        
        const printContent = printContentElement.innerHTML;
        
        if (!printContent || printContent.trim() === '') {
            showAlert('No content to print. Please ensure the quotation is loaded.', 'warning');
            return;
        }
        
        const printWindow = window.open('', '_blank');
        
        if (!printWindow) {
            showAlert('Print popup was blocked. Please allow popups for this site and try again.', 'warning');
            return;
        }
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Quotation</title>
                <style>
                    @page {
                        margin: 1.65in 0.75in 1in 0.75in;
                    }
                    body {
                        font-family: Arial, sans-serif;
                        font-size: 12px;
                        line-height: 1.4;
                    }
                    .table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 1rem;
                    }
                    .table th, .table td {
                        padding: 8px;
                        border: 1px solid #dee2e6;
                        text-align: left;
                    }
                    .table-dark th {
                        background-color: #343a40;
                        color: white;
                    }
                    .table-striped tbody tr:nth-of-type(odd) {
                        background-color: rgba(0,0,0,.05);
                    }
                    h6 {
                        margin-top: 1.5rem;
                        margin-bottom: 0.5rem;
                        font-weight: bold;
                    }
                    .text-end {
                        text-align: right;
                    }
                    @media print {
                        .no-print {
                            display: none;
                        }
                    }
                </style>
            </head>
            <body>
                <div style="text-align: center; margin-bottom: 2rem;">
                    <h1>Quotation</h1>
                </div>
                ${printContent}
            </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 100);
        
    } catch (error) {
        console.error('Print error:', error);
        showAlert('An error occurred while printing. Please try again.', 'danger');
    }
}

// Setup purchase order table functionality
function setupPurchaseOrderTable() {
    // Search functionality
    const searchInput = document.getElementById('po-search');
    if (searchInput) {
        searchInput.addEventListener('input', filterPurchaseOrders);
    }

    // Sorting functionality
    const sortableHeaders = document.querySelectorAll('#purchase-orders-table .sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-sort');
            sortPurchaseOrders(column);
        });
    });
}

// Filter purchase orders
function filterPurchaseOrders() {
    const searchTerm = document.getElementById('po-search').value.toLowerCase();

    let filteredPOs = allPurchaseOrders.filter(po => {
        const matchesSearch = !searchTerm || 
            (po.po_number && po.po_number.toLowerCase().includes(searchTerm)) ||
            (po.supplier_name && po.supplier_name.toLowerCase().includes(searchTerm));
        
        return matchesSearch;
    });

    displayPurchaseOrders(filteredPOs);
}

// Sort purchase orders
function sortPurchaseOrders(column) {
    if (poSortColumn === column) {
        poSortDirection = poSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        poSortColumn = column;
        poSortDirection = 'asc';
    }
    
    const sortedPOs = [...allPurchaseOrders].sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        
        if (column === 'date') {
            aVal = new Date(aVal);
            bVal = new Date(bVal);
        } else if (column === 'grand_total') {
            aVal = parseFloat(aVal) || 0;
            bVal = parseFloat(bVal) || 0;
        } else {
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
        }
        
        if (aVal < bVal) return poSortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return poSortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    displayPurchaseOrders(sortedPOs);
    updatePOSortIcons();
}

// Update purchase order sort icons
function updatePOSortIcons() {
    const headers = document.querySelectorAll('#purchase-orders-table .sortable');
    headers.forEach(header => {
        const icon = header.querySelector('.sort-icon');
        const column = header.getAttribute('data-sort');
        
        if (column === poSortColumn) {
            icon.className = `fas fa-sort-${poSortDirection === 'asc' ? 'up' : 'down'} sort-icon`;
        } else {
            icon.className = 'fas fa-sort sort-icon';
        }
    });
}

// Clear purchase order filters
function clearPOFilters() {
    document.getElementById('po-search').value = '';
    filterPurchaseOrders();
}

let currentInvoiceId = null;
let invoiceItemCounter = 0;
let allInvoices = [];
let invoiceSortColumn = 'date';
let invoiceSortDirection = 'desc';

async function loadInvoices() {
    try {
        const response = await fetch('/api/invoices');
        const invoices = await response.json();
        allInvoices = Array.isArray(invoices) ? invoices : [];
        displayInvoices(allInvoices);
    } catch (error) {
        console.error('Error loading invoices:', error);
        showAlert('Error loading invoices', 'danger');
    }
}

function loadInvoicesEnhanced() {
    return loadInvoices();
}

function displayInvoices(invoices) {
    const tbody = document.getElementById('invoices-table-body');
    const emptyState = document.getElementById('invoices-empty-state');

    if (!tbody || !emptyState) return;

    if (!invoices || invoices.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('d-none');
        return;
    }

    emptyState.classList.add('d-none');
    tbody.innerHTML = invoices.map(inv => createInvoiceTableRow(inv)).join('');
}

function createInvoiceTableRow(invoice) {
    return `
        <tr>
            <td>${escapeHtml(invoice.invoice_number || 'N/A')}</td>
            <td>${formatDate(invoice.date)}</td>
            <td>${escapeHtml(invoice.to_client || 'N/A')}</td>
            <td>${escapeHtml(invoice.ref_no || '')}</td>
            <td><strong>${parseFloat(invoice.grand_total || 0).toFixed(2)}</strong></td>
            <td>
                <div class="btn-group" role="group">
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="viewInvoice(${invoice.id})" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" onclick="editInvoice(${invoice.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-success" onclick="generateInvoiceExcelById(${invoice.id})" title="Generate Excel">
                        <i class="fas fa-file-excel"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteInvoice(${invoice.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function showInvoiceForm(invoiceId = null) {
    currentInvoiceId = invoiceId;
    const dashboard = document.getElementById('invoice-dashboard');
    const container = document.getElementById('invoice-form-container');
    if (dashboard) dashboard.classList.add('d-none');
    if (container) container.classList.remove('d-none');

    const title = document.getElementById('invoice-form-title');
    if (invoiceId) {
        if (title) title.textContent = 'Edit Invoice';
        loadInvoiceForEdit(invoiceId);
    } else {
        if (title) title.textContent = 'New Invoice';
        resetInvoiceForm();
    }
}

function hideInvoiceForm() {
    const dashboard = document.getElementById('invoice-dashboard');
    const container = document.getElementById('invoice-form-container');
    if (dashboard) dashboard.classList.remove('d-none');
    if (container) container.classList.add('d-none');
    resetInvoiceForm();
    currentInvoiceId = null;
}

function resetInvoiceForm() {
    const form = document.getElementById('invoice-form');
    if (form) form.reset();
    const idInput = document.getElementById('invoice-id');
    if (idInput) idInput.value = '';
    const tbody = document.getElementById('invoice-items-tbody');
    if (tbody) tbody.innerHTML = '';
    invoiceItemCounter = 0;

    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('invoice-date');
    if (dateInput) dateInput.value = today;

    updateInvoiceTotalDisplays(0, 0, 0);
    addInvoiceItem();
}

async function loadInvoiceForEdit(invoiceId) {
    try {
        const response = await fetch(`/api/invoices/${invoiceId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const invoice = await response.json();

        const idInput = document.getElementById('invoice-id');
        if (idInput) idInput.value = invoice.id;
        const refNoInput = document.getElementById('invoice-ref-no');
        if (refNoInput) refNoInput.value = invoice.ref_no || '';
        const arNoInput = document.getElementById('invoice-ar-no');
        if (arNoInput) arNoInput.value = invoice.ar_no || '';
        const dateInput = document.getElementById('invoice-date');
        if (dateInput) dateInput.value = invoice.date || '';
        const invoiceNoInput = document.getElementById('invoice-number');
        if (invoiceNoInput) invoiceNoInput.value = invoice.invoice_number || '';
        const toInput = document.getElementById('invoice-to');
        if (toInput) toInput.value = invoice.to_client || '';

        const tbody = document.getElementById('invoice-items-tbody');
        if (tbody) tbody.innerHTML = '';
        invoiceItemCounter = 0;

        if (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0) {
            invoice.items.forEach(item => addInvoiceItemRow(item));
        } else {
            addInvoiceItem();
        }

        updateInvoiceTotalDisplays(
            invoice.total_without_gst || 0,
            invoice.gst_amount || 0,
            invoice.grand_total || 0
        );
    } catch (error) {
        console.error('Error loading invoice for edit:', error);
        showAlert('Error loading invoice data', 'danger');
    }
}

function addInvoiceItem(itemData = null) {
    addInvoiceItemRow(itemData);
}

function addInvoiceItemRow(itemData = null) {
    invoiceItemCounter++;
    const tbody = document.getElementById('invoice-items-tbody');
    if (!tbody) return;

    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="serial-number">${invoiceItemCounter}</td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.description || '')}" placeholder="Description"></td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(itemData?.au || '')}" placeholder="A/U"></td>
        <td><input type="number" class="form-control form-control-sm qty-input" value="${escapeHtml(itemData?.quantity || '')}" placeholder="Qty" min="0" onchange="calculateInvoiceRowTotal(this)"></td>
        <td><input type="number" class="form-control form-control-sm up-input" value="${escapeHtml(itemData?.unit_price || '')}" placeholder="U/P" step="0.01" min="0" onchange="calculateInvoiceRowTotal(this)"></td>
        <td><input type="number" class="form-control form-control-sm tp-input" value="${escapeHtml(itemData?.total_price || '')}" placeholder="T/P" step="0.01" readonly></td>
        <td><input type="number" class="form-control form-control-sm supplier-up-input" value="${escapeHtml(itemData?.supplier_up || '')}" placeholder="Supplier U/P" step="0.01" min="0" onchange="calculateInvoiceCalculatedPrice(this)"></td>
        <td><input type="number" class="form-control form-control-sm profit-factor-input" value="${escapeHtml(itemData?.profit_factor || '')}" placeholder="Profit Factor" step="0.01" min="0" onchange="calculateInvoiceCalculatedPrice(this)"></td>
        <td><input type="number" class="form-control form-control-sm exchange-rate-input" value="${escapeHtml(itemData?.exchange_rate || '')}" placeholder="Exchange Rate" step="0.01" min="0" onchange="calculateInvoiceCalculatedPrice(this)"></td>
        <td><input type="number" class="form-control form-control-sm calculated-price-input" value="${escapeHtml(itemData?.calculated_price || '')}" placeholder="Calculated Price" step="0.01" readonly></td>
        <td>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteInvoiceItemRow(this)">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    tbody.appendChild(row);
    updateInvoiceSerialNumbers();

    const supplierUp = parseFloat(itemData?.supplier_up) || 0;
    const profitFactor = parseFloat(itemData?.profit_factor) || 0;
    const exchangeRate = parseFloat(itemData?.exchange_rate) || 0;
    if (supplierUp || profitFactor || exchangeRate) {
        const calc = supplierUp * profitFactor * exchangeRate;
        const calcInput = row.querySelector('.calculated-price-input');
        if (calcInput) calcInput.value = calc.toFixed(2);
    }
}

function deleteInvoiceItemRow(button) {
    button.closest('tr').remove();
    updateInvoiceSerialNumbers();
    calculateInvoiceTotals();
}

function updateInvoiceSerialNumbers() {
    const rows = document.querySelectorAll('#invoice-items-tbody tr');
    rows.forEach((row, index) => {
        const cell = row.querySelector('.serial-number');
        if (cell) cell.textContent = index + 1;
    });
    invoiceItemCounter = rows.length;
}

function calculateInvoiceRowTotal(input) {
    const row = input.closest('tr');
    const qty = parseFloat(row.querySelector('.qty-input').value) || 0;
    const up = parseFloat(row.querySelector('.up-input').value) || 0;
    const tp = qty * up;
    row.querySelector('.tp-input').value = tp.toFixed(2);
    calculateInvoiceTotals();
}

function calculateInvoiceCalculatedPrice(input) {
    const row = input.closest('tr');
    const supplierUp = parseFloat(row.querySelector('.supplier-up-input').value) || 0;
    const profitFactor = parseFloat(row.querySelector('.profit-factor-input').value) || 0;
    const exchangeRate = parseFloat(row.querySelector('.exchange-rate-input').value) || 0;
    const calc = supplierUp * profitFactor * exchangeRate;
    row.querySelector('.calculated-price-input').value = calc.toFixed(2);
}

function calculateInvoiceTotals() {
    const rows = document.querySelectorAll('#invoice-items-tbody tr');
    let totalWithoutGst = 0;
    rows.forEach(row => {
        const tp = parseFloat(row.querySelector('.tp-input').value) || 0;
        totalWithoutGst += tp;
    });
    const gstAmount = totalWithoutGst * 0.18;
    const grandTotal = totalWithoutGst + gstAmount;
    updateInvoiceTotalDisplays(totalWithoutGst, gstAmount, grandTotal);
}

function updateInvoiceTotalDisplays(totalWithoutGst, gstAmount, grandTotal) {
    const totalEl = document.getElementById('invoice-total-without-gst');
    const gstEl = document.getElementById('invoice-gst-amount');
    const grandEl = document.getElementById('invoice-grand-total');
    const totalInput = document.getElementById('invoice-total-without-gst-input');
    const gstInput = document.getElementById('invoice-gst-amount-input');
    const grandInput = document.getElementById('invoice-grand-total-input');

    const totalFixed = parseFloat(totalWithoutGst || 0).toFixed(2);
    const gstFixed = parseFloat(gstAmount || 0).toFixed(2);
    const grandFixed = parseFloat(grandTotal || 0).toFixed(2);

    if (totalEl) totalEl.textContent = totalFixed;
    if (gstEl) gstEl.textContent = gstFixed;
    if (grandEl) grandEl.textContent = grandFixed;
    if (totalInput) totalInput.value = totalFixed;
    if (gstInput) gstInput.value = gstFixed;
    if (grandInput) grandInput.value = grandFixed;
}

document.addEventListener('DOMContentLoaded', function() {
    const invoiceForm = document.getElementById('invoice-form');
    if (invoiceForm) {
        invoiceForm.addEventListener('submit', handleInvoiceSubmit);
    }

    const invoiceSearch = document.getElementById('invoice-search');
    if (invoiceSearch) {
        invoiceSearch.addEventListener('input', filterInvoices);
    }
});

async function handleInvoiceSubmit(event) {
    event.preventDefault();

    calculateInvoiceTotals();

    const formData = new FormData(event.target);
    const invoiceId = formData.get('invoice-id');

    const items = [];
    const rows = document.querySelectorAll('#invoice-items-tbody tr');
    rows.forEach((row, index) => {
        const inputs = row.querySelectorAll('input');
        const item = {
            serial_number: index + 1,
            description: inputs[0].value,
            au: inputs[1].value,
            quantity: parseFloat(inputs[2].value) || 0,
            unit_price: parseFloat(inputs[3].value) || 0,
            total_price: parseFloat(inputs[4].value) || 0,
            supplier_up: parseFloat(inputs[5].value) || 0,
            profit_factor: parseFloat(inputs[6].value) || 0,
            exchange_rate: parseFloat(inputs[7].value) || 0,
            calculated_price: parseFloat(inputs[8].value) || 0
        };
        if (item.description || item.quantity || item.unit_price) {
            items.push(item);
        }
    });

    const invoiceData = {
        ref_no: formData.get('ref_no'),
        ar_no: formData.get('ar_no') || null,
        date: formData.get('date'),
        invoice_number: formData.get('invoice_number'),
        to_client: formData.get('to_client'),
        total_without_gst: parseFloat(formData.get('total_without_gst')) || 0,
        gst_amount: parseFloat(formData.get('gst_amount')) || 0,
        grand_total: parseFloat(formData.get('grand_total')) || 0,
        items
    };

    try {
        const url = invoiceId ? `/api/invoices/${invoiceId}` : '/api/invoices';
        const method = invoiceId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
            },
            body: JSON.stringify(invoiceData)
        });

        if (response.ok) {
            showAlert(invoiceId ? 'Invoice updated successfully!' : 'Invoice created successfully!', 'success');
            hideInvoiceForm();
            loadInvoices();
        } else {
            const error = await response.json();
            showAlert('Error saving invoice: ' + (error.error || 'Unknown error'), 'danger');
        }
    } catch (error) {
        console.error('Error saving invoice:', error);
        showAlert('Error saving invoice', 'danger');
    }
}

async function viewInvoice(invoiceId) {
    try {
        const response = await fetch(`/api/invoices/${invoiceId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const invoice = await response.json();

        const modalContent = document.getElementById('invoice-detail-content');
        if (!modalContent) return;

        modalContent.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>Invoice Information</h6>
                    <table class="table table-sm">
                        <tr><td><strong>NTN#:</strong></td><td>${escapeHtml(invoice.ntn || '4371458-7')}</td></tr>
                        <tr><td><strong>GST#:</strong></td><td>${escapeHtml(invoice.gst || '2600437145815')}</td></tr>
                        <tr><td><strong>Ref#:</strong></td><td>${escapeHtml(invoice.ref_no || '')}</td></tr>
                        <tr><td><strong>A.R.No:</strong></td><td>${escapeHtml(invoice.ar_no || '')}</td></tr>
                        <tr><td><strong>Date:</strong></td><td>${formatDate(invoice.date)}</td></tr>
                        <tr><td><strong>Invoice No#:</strong></td><td>${escapeHtml(invoice.invoice_number || '')}</td></tr>
                        <tr><td><strong>To:</strong></td><td>${escapeHtml(invoice.to_client || '')}</td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6>Totals</h6>
                    <table class="table table-sm">
                        <tr><td><strong>Total without GST:</strong></td><td>${parseFloat(invoice.total_without_gst || 0).toFixed(2)}</td></tr>
                        <tr><td><strong>GST 18%:</strong></td><td>${parseFloat(invoice.gst_amount || 0).toFixed(2)}</td></tr>
                        <tr><td><strong>Grand Total:</strong></td><td><strong>${parseFloat(invoice.grand_total || 0).toFixed(2)}</strong></td></tr>
                    </table>
                </div>
            </div>
            ${invoice.items && invoice.items.length > 0 ? `
                <div class="mt-4">
                    <h6>Items</h6>
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead class="table-dark">
                                <tr>
                                    <th>Sr.</th>
                                    <th>Desc</th>
                                    <th>A/U</th>
                                    <th>QTy</th>
                                    <th>U/P</th>
                                    <th>T/P</th>
                                    <th>Supplier U/P</th>
                                    <th>Profit Factor</th>
                                    <th>Exchange Rate</th>
                                    <th>Calculated Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${invoice.items.map(item => `
                                    <tr>
                                        <td>${item.serial_number}</td>
                                        <td>${escapeHtml(item.description || '')}</td>
                                        <td>${escapeHtml(item.au || '')}</td>
                                        <td>${parseFloat(item.quantity || 0)}</td>
                                        <td>${parseFloat(item.unit_price || 0).toFixed(2)}</td>
                                        <td>${parseFloat(item.total_price || 0).toFixed(2)}</td>
                                        <td>${parseFloat(item.supplier_up || 0).toFixed(2)}</td>
                                        <td>${parseFloat(item.profit_factor || 0).toFixed(2)}</td>
                                        <td>${parseFloat(item.exchange_rate || 0).toFixed(2)}</td>
                                        <td>${parseFloat(item.calculated_price || 0).toFixed(2)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : '<div class="mt-4"><p class="text-muted">No items found.</p></div>'}

            <div class="mt-4" id="related-documents-invoice"></div>
        `;

        loadRelatedDocumentsForInvoice(invoiceId);

        const modal = new bootstrap.Modal(document.getElementById('invoiceDetailModal'));
        modal.show();
    } catch (error) {
        console.error('Error loading invoice:', error);
        showAlert('Error loading invoice details', 'danger');
    }
}

async function loadRelatedDocumentsForInvoice(invoiceId) {
    const container = document.getElementById('related-documents-invoice');
    if (!container) return;
    container.innerHTML = '<div class="text-muted">Loading related documents...</div>';

    try {
        const resp = await fetch(`/api/invoices/${invoiceId}/related`, { credentials: 'include' });
        const data = await resp.json();
        if (!resp.ok) {
            container.innerHTML = `<div class="text-danger">${escapeHtml(data.error || 'Failed to load related documents')}</div>`;
            return;
        }

        const queryButton = data.query
            ? relatedButton(`Query: ${escapeHtml(data.query.nsets_case_number || ('#' + data.query.id))}`, `goToQuery(${data.query.id})`, 'outline-primary')
            : '';
        const quotationButton = data.quotation
            ? relatedButton(`Quotation: ${escapeHtml(data.quotation.quotation_number || ('#' + data.quotation.id))}`, `goToQuotation(${data.quotation.id})`, 'outline-secondary')
            : '';
        const poButton = data.purchaseOrder
            ? relatedButton(`PO: ${escapeHtml(data.purchaseOrder.po_number || ('#' + data.purchaseOrder.id))}`, `goToPurchaseOrder(${data.purchaseOrder.id})`, 'outline-success')
            : '';

        const blocks = [
            queryButton ? `<div class="me-3">${renderRelatedDocumentsSection('Query', queryButton)}</div>` : '',
            quotationButton ? `<div class="me-3">${renderRelatedDocumentsSection('Quotation', quotationButton)}</div>` : '',
            poButton ? `<div class="me-3">${renderRelatedDocumentsSection('Purchase Order', poButton)}</div>` : ''
        ].filter(Boolean).join('');

        container.innerHTML = blocks || renderRelatedDocumentsSection('Related Documents', '');
    } catch (e) {
        console.error('Error loading related docs for invoice:', e);
        container.innerHTML = '<div class="text-danger">Failed to load related documents</div>';
    }
}

function editInvoice(invoiceId) {
    showInvoiceForm(invoiceId);
}

async function deleteInvoice(invoiceId) {
    if (!confirm('Are you sure you want to delete this invoice?')) {
        return;
    }

    try {
        const response = await fetch(`/api/invoices/${invoiceId}`, {
            method: 'DELETE',
            headers: csrfToken ? { 'x-csrf-token': csrfToken } : {}
        });

        if (response.ok) {
            showAlert('Invoice deleted successfully', 'success');
            loadInvoices();
        } else {
            const error = await response.json();
            showAlert('Error deleting invoice: ' + (error.error || 'Unknown error'), 'danger');
        }
    } catch (error) {
        console.error('Error deleting invoice:', error);
        showAlert('Error deleting invoice', 'danger');
    }
}

function generateInvoiceExcelById(invoiceId) {
    window.open('/api/invoices/' + invoiceId + '/excel', '_blank');
}

function generateInvoiceExcel() {
    if (!currentInvoiceId) {
        showAlert('Please save the invoice first before generating Excel', 'warning');
        return;
    }
    generateInvoiceExcelById(currentInvoiceId);
}

function setupInvoiceTable() {
    const sortableHeaders = document.querySelectorAll('#invoices-table .sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-sort');
            sortInvoices(column);
        });
    });
}

function filterInvoices() {
    const searchTermEl = document.getElementById('invoice-search');
    const searchTerm = (searchTermEl ? searchTermEl.value : '').toLowerCase();

    const filtered = allInvoices.filter(inv => {
        const matches = !searchTerm ||
            (inv.invoice_number && inv.invoice_number.toLowerCase().includes(searchTerm)) ||
            (inv.ref_no && inv.ref_no.toLowerCase().includes(searchTerm)) ||
            (inv.to_client && inv.to_client.toLowerCase().includes(searchTerm));
        return matches;
    });

    displayInvoices(filtered);
}

function sortInvoices(column) {
    if (invoiceSortColumn === column) {
        invoiceSortDirection = invoiceSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        invoiceSortColumn = column;
        invoiceSortDirection = 'asc';
    }

    const sorted = [...allInvoices].sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];

        if (column === 'date') {
            aVal = new Date(aVal);
            bVal = new Date(bVal);
        } else if (column === 'grand_total') {
            aVal = parseFloat(aVal) || 0;
            bVal = parseFloat(bVal) || 0;
        } else {
            aVal = String(aVal || '').toLowerCase();
            bVal = String(bVal || '').toLowerCase();
        }

        if (aVal < bVal) return invoiceSortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return invoiceSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    displayInvoices(sorted);
    updateInvoiceSortIcons();
}

function updateInvoiceSortIcons() {
    const headers = document.querySelectorAll('#invoices-table .sortable');
    headers.forEach(header => {
        const icon = header.querySelector('.sort-icon');
        const column = header.getAttribute('data-sort');

        if (!icon) return;

        if (column === invoiceSortColumn) {
            icon.className = `fas fa-sort-${invoiceSortDirection === 'asc' ? 'up' : 'down'} sort-icon`;
        } else {
            icon.className = 'fas fa-sort sort-icon';
        }
    });
}

function clearInvoiceFilters() {
    const searchEl = document.getElementById('invoice-search');
    if (searchEl) searchEl.value = '';
    filterInvoices();
}

// Status Change Functions
let currentStatusChangeQueryId = null;

// Show status change modal
async function showStatusChangeModal(queryId) {
    currentStatusChangeQueryId = queryId;
    
    try {
        // Fetch query details
        const response = await fetch(`/api/queries/${queryId}`);
        const query = await response.json();
        
        // Populate supplier responses container
        const container = document.getElementById('supplier-responses-container');
        const suppliers = query.query_sent_to ? query.query_sent_to.split(',').map(s => s.trim()) : [];
        
        if (suppliers.length === 0) {
            container.innerHTML = '<div class="alert alert-warning">No suppliers found for this query.</div>';
        } else {
            container.innerHTML = suppliers.map((supplier, index) => `
                <div class="card mb-3">
                    <div class="card-header">
                        <h6 class="mb-0">Supplier: ${supplier}</h6>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <label class="form-label">Response Status</label>
                                <div class="form-check">
                                    <input class="form-check-input supplier-response" type="radio" name="supplier_${index}" id="supplier_${index}_yes" value="yes" onchange="toggleAttachmentUpload(${index})">
                                    <label class="form-check-label" for="supplier_${index}_yes">Yes - Response Received</label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input supplier-response" type="radio" name="supplier_${index}" id="supplier_${index}_no" value="no" onchange="toggleAttachmentUpload(${index})">
                                    <label class="form-check-label" for="supplier_${index}_no">No - No Response</label>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div id="attachment_${index}" class="attachment-upload" style="display: none;">
                                    <label class="form-label">Upload Supplier Response</label>
                                    <input type="file" class="form-control" name="supplier_attachment_${index}" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx">
                                    <div class="form-text">Accepted formats: PDF, Images, Word, Excel</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
        // Reset confirmation checkbox
        document.getElementById('confirm-all-responses').checked = false;
        document.getElementById('update-status-btn').disabled = true;
        
        // Add event listeners to radio buttons and check initial state
        setTimeout(() => {
            checkAllResponsesSelected();
        }, 100);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('statusChangeModal'));
        modal.show();
        
    } catch (error) {
        console.error('Error loading query for status change:', error);
        showAlert('Error loading query details', 'danger');
    }
}

// Toggle attachment upload visibility
function toggleAttachmentUpload(supplierIndex) {
    const yesRadio = document.getElementById(`supplier_${supplierIndex}_yes`);
    const attachmentDiv = document.getElementById(`attachment_${supplierIndex}`);
    
    if (yesRadio && yesRadio.checked) {
        attachmentDiv.style.display = 'block';
    } else {
        attachmentDiv.style.display = 'none';
    }
    
    // Check validation after radio button change
    setTimeout(() => {
        checkAllResponsesSelected();
    }, 50);
}

// Check if any supplier responses are selected and at least one is 'yes'
function checkAllResponsesSelected() {
    const suppliers = document.querySelectorAll('[name^="supplier_"]');
    const uniqueSuppliers = new Set();
    
    suppliers.forEach(radio => {
        const supplierName = radio.name;
        uniqueSuppliers.add(supplierName);
    });
    
    let anySelected = false;
    let atLeastOneYes = false;
    
    uniqueSuppliers.forEach(supplierName => {
        const radios = document.querySelectorAll(`[name="${supplierName}"]`);
        const selectedRadio = Array.from(radios).find(radio => radio.checked);
        
        if (selectedRadio) {
            anySelected = true;
            if (selectedRadio.value === 'yes') {
                atLeastOneYes = true;
            }
        }
    });
    
    const confirmCheckbox = document.getElementById('confirm-all-responses');
    const updateBtn = document.getElementById('update-status-btn');
    const alertInfo = document.querySelector('.alert-info');
    
    // Update alert message based on validation status
    if (alertInfo) {
        if (!anySelected) {
            alertInfo.innerHTML = '<i class="fas fa-info-circle me-2"></i>Please provide supplier responses for at least one entry before changing status to submitted.';
            alertInfo.className = 'alert alert-info';
        } else if (!atLeastOneYes) {
            alertInfo.innerHTML = '<i class="fas fa-exclamation-triangle me-2"></i>At least one supplier must respond "Yes" to change the status to submitted.';
            alertInfo.className = 'alert alert-warning';
        } else {
            alertInfo.innerHTML = '<i class="fas fa-check-circle me-2"></i>Validation passed. At least one supplier has responded "Yes".';
            alertInfo.className = 'alert alert-success';
        }
    }
    
    // Enable button only if at least one supplier said yes and checkbox is checked
    if (atLeastOneYes && confirmCheckbox && confirmCheckbox.checked) {
        updateBtn.disabled = false;
    } else {
        updateBtn.disabled = true;
    }
    
    // Add event listeners to radio buttons if not already added
    suppliers.forEach(radio => {
        if (!radio.hasAttribute('data-listener-added')) {
            radio.addEventListener('change', checkAllResponsesSelected);
            radio.setAttribute('data-listener-added', 'true');
        }
    });
}

// Add event listener for confirmation checkbox
document.addEventListener('DOMContentLoaded', function() {
    const confirmCheckbox = document.getElementById('confirm-all-responses');
    if (confirmCheckbox) {
        confirmCheckbox.addEventListener('change', checkAllResponsesSelected);
    }
});

// Update query status
async function updateQueryStatus() {
    if (!currentStatusChangeQueryId) {
        showAlert('No query selected for status update', 'danger');
        return;
    }
    
    try {
        console.log('Starting status update for query:', currentStatusChangeQueryId);
        
        // First, get the original query to get supplier names
        const queryResponse = await fetch(`/api/queries/${currentStatusChangeQueryId}`);
        if (!queryResponse.ok) {
            throw new Error(`Failed to fetch query: ${queryResponse.status}`);
        }
        const query = await queryResponse.json();
        const supplierNames = query.query_sent_to ? query.query_sent_to.split(',').map(s => s.trim()) : [];
        
        console.log('Query data:', query);
        console.log('Supplier names:', supplierNames);
        
        const formData = new FormData();
        formData.append('status', 'submitted');
        
        // Collect supplier responses and attachments
        const supplierResponses = [];
        const suppliers = document.querySelectorAll('[name^="supplier_"]');
        const uniqueSuppliers = new Set();
        
        suppliers.forEach(radio => {
            const supplierName = radio.name;
            uniqueSuppliers.add(supplierName);
        });
        
        console.log('Found supplier radio groups:', Array.from(uniqueSuppliers));
        
        uniqueSuppliers.forEach(supplierName => {
            const radios = document.querySelectorAll(`[name="${supplierName}"]`);
            const selectedRadio = Array.from(radios).find(radio => radio.checked);
            
            if (selectedRadio) {
                const supplierIndex = parseInt(supplierName.split('_')[1]);
                const actualSupplierName = supplierNames[supplierIndex] || ('Supplier ' + (supplierIndex + 1));
                
                console.log('Processing supplier ' + supplierIndex + ': ' + actualSupplierName + ', response: ' + selectedRadio.value);
                
                const response = {
                    supplier: actualSupplierName,
                    response: selectedRadio.value
                };
                
                // Add attachment if yes was selected
                if (selectedRadio.value === 'yes') {
                    const fileInput = document.querySelector(`[name="supplier_attachment_${supplierIndex}"]`);
                    console.log(`Looking for file input: supplier_attachment_${supplierIndex}`, fileInput);
                    if (fileInput && fileInput.files[0]) {
                        console.log('Found file:', fileInput.files[0].name);
                        formData.append(`supplier_attachment_${supplierIndex}`, fileInput.files[0]);
                        response.hasAttachment = true;
                    }
                }
                
                supplierResponses.push(response);
            }
        });
        
        console.log('Supplier responses:', supplierResponses);
        formData.append('supplier_responses', JSON.stringify(supplierResponses));
        
        console.log('Sending status update request...');
        const response = await fetch(`/api/queries/${currentStatusChangeQueryId}/status`, {
            method: 'PUT',
            body: formData
        });
        
        console.log('Response status:', response.status);
        const result = await response.json();
        console.log('Response result:', result);
        
        if (response.ok) {
            showAlert('Query status updated successfully', 'success');
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('statusChangeModal'));
            if (modal) {
                modal.hide();
            }
            
            // Refresh queries - load all queries and maintain current filter
            loadAllQueries();
        } else {
            console.error('Server error:', result);
            showAlert(result.error || 'Error updating query status', 'danger');
        }
    } catch (error) {
        console.error('Error updating query status:', error);
        showAlert(`Error updating query status: ${error.message}`, 'danger');
    }
}

// Load purchase orders when module is shown
function loadPurchaseOrdersEnhanced() {
    loadPurchaseOrders();
}

// Authentication and Admin Dashboard Functions

// Check authentication status on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
});

// Check if user is authenticated
async function checkAuthStatus() {
    // Don't check auth status if we're already on the login page
    if (window.location.pathname === '/login.html' || window.location.pathname.endsWith('/login.html')) {
        return;
    }
    
    try {
        const response = await fetch('/api/auth/check', { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
                setupUserInterface(data.user);
            } else {
                redirectToLogin();
            }
        } else {
            redirectToLogin();
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        redirectToLogin();
    }
}

// Setup user interface based on user data
function setupUserInterface(user) {
    currentUser = user;
    try {
        sessionStorage.setItem('currentUser', JSON.stringify(user));
    } catch (e) {
        console.warn('Failed to persist currentUser:', e.message);
    }

    // Update user info in navbar
    document.getElementById('currentUser').textContent = user.full_name || user.username;
    document.getElementById('userInfo').textContent = `${user.full_name || user.username} (${user.role})`;
    
    // Show/hide admin navigation
    if (user.role === 'admin') {
        document.getElementById('adminNavItem').style.display = 'block';
    }
    
    // Setup permission-based navigation
    setupPermissionBasedNavigation(user.permissions);
}

// Setup navigation based on user permissions
function setupPermissionBasedNavigation(permissions) {
    // Convert permissions to array format if it's an object
    let permissionArray = [];
    if (typeof permissions === 'object' && permissions !== null) {
        permissionArray = Object.keys(permissions).filter(key => permissions[key]);
    } else if (Array.isArray(permissions)) {
        permissionArray = permissions;
    }
    
    const navItems = document.querySelectorAll('#mainNavigation .nav-item');
    
    navItems.forEach(item => {
        const link = item.querySelector('.nav-link');
        const permission = link.getAttribute('data-permission');
        
        if (permission && permission !== 'admin') {
            if (!permissionArray.includes(permission)) {
                item.style.display = 'none';
            } else {
                item.style.display = 'block';
            }
        }
    });
    
    // Show first available module
    const firstVisibleLink = document.querySelector('#mainNavigation .nav-link:not([style*="display: none"])');
    if (firstVisibleLink) {
        firstVisibleLink.click();
    }
}

// Redirect to login page
function redirectToLogin() {
    window.location.href = '/login.html';
}

// Logout function
async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include',
            headers: csrfToken ? { 'x-csrf-token': csrfToken } : {}
        });
        
        if (response.ok) {
            redirectToLogin();
        } else {
            showAlert('Error logging out', 'danger');
        }
    } catch (error) {
        console.error('Error logging out:', error);
        showAlert('Error logging out', 'danger');
    }
}

// Admin Dashboard Functions

// Show admin module and load users
function showAdminModule() {
    loadUsers();
    loadUserStats();
}

// Load all users for admin dashboard
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        if (response.ok) {
            const users = await response.json();
            displayUsersTable(users);
        } else {
            showAlert('Error loading users', 'danger');
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showAlert('Error loading users', 'danger');
    }
}

// Display users in table
function displayUsersTable(users) {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '';
    
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.username}</td>
            <td>${user.full_name || 'N/A'}</td>
            <td>${user.email || 'N/A'}</td>
            <td>
                <span class="badge ${user.role === 'admin' ? 'bg-danger' : 'bg-primary'}">
                    ${user.role}
                </span>
            </td>
            <td>
                <span class="badge ${user.status === 'active' ? 'bg-success' : 'bg-secondary'}">
                    ${user.status}
                </span>
            </td>
            <td>
                <div class="permissions-list">
                    ${user.permissions ? (typeof user.permissions === 'string' ? user.permissions.split(',') : Object.keys(user.permissions).filter(key => user.permissions[key])).map(perm => 
                        `<span class="badge bg-info me-1">${perm}</span>`
                    ).join('') : 'None'}
                </div>
            </td>
            <td>${new Date(user.created_at).toLocaleDateString()}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="editUser(${user.id})" title="Edit User">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-warning" onclick="resetUserPassword(${user.id}, '${user.username}')" title="Reset Password">
                        <i class="fas fa-key"></i>
                    </button>
                    ${user.username !== 'admin' ? `
                        <button class="btn btn-outline-danger" onclick="deactivateUser(${user.id})" title="Deactivate User">
                            <i class="fas fa-user-times"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Load user statistics
async function loadUserStats() {
    try {
        const response = await fetch('/api/users');
        if (response.ok) {
            const users = await response.json();
            
            const totalUsers = users.length;
            const activeUsers = users.filter(u => u.status === 'active').length;
            const adminUsers = users.filter(u => u.role === 'admin').length;
            const regularUsers = users.filter(u => u.role === 'user').length;
            
            document.getElementById('totalUsersCount').textContent = totalUsers;
            document.getElementById('activeUsersCount').textContent = activeUsers;
            document.getElementById('adminUsersCount').textContent = adminUsers;
            document.getElementById('regularUsersCount').textContent = regularUsers;
        }
    } catch (error) {
        console.error('Error loading user stats:', error);
    }
}

// Show create user modal
function showCreateUserModal() {
    document.getElementById('createUserForm').reset();
    // Set default permissions (queries only)
    document.getElementById('permQueries').checked = true;
    // Show permission section by default
    document.getElementById('permissionsSection').style.display = 'block';
    const modal = new bootstrap.Modal(document.getElementById('createUserModal'));
    modal.show();
}

// Handle role change in create user form
function handleRoleChange(selectElement) {
    const permissionsSection = document.getElementById('permissionsSection');
    const allPermissionCheckboxes = document.querySelectorAll('#createUserModal input[name="permissions"]');
    
    if (selectElement.value === 'admin') {
        // Hide permissions section for admin
        permissionsSection.style.display = 'none';
        // Auto-check all permissions for admin
        allPermissionCheckboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
    } else {
        // Show permissions section for regular users
        permissionsSection.style.display = 'block';
        // Reset to default (only queries)
        allPermissionCheckboxes.forEach(checkbox => {
            checkbox.checked = checkbox.value === 'queries';
        });
    }
}

// Handle role change in edit user form
function handleEditRoleChange(selectElement) {
    const permissionsSection = document.getElementById('editPermissionsSection');
    const allPermissionCheckboxes = document.querySelectorAll('#editUserModal input[name="permissions"]');
    
    if (selectElement.value === 'admin') {
        // Hide permissions section for admin
        permissionsSection.style.display = 'none';
        // Auto-check all permissions for admin
        allPermissionCheckboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
    } else {
        // Show permissions section for regular users
        permissionsSection.style.display = 'block';
    }
}

// Handle create user form submission
document.addEventListener('DOMContentLoaded', function() {
    const createUserForm = document.getElementById('createUserForm');
    if (createUserForm) {
        createUserForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const permissions = Array.from(document.querySelectorAll('input[name="permissions"]:checked'))
                .map(cb => cb.value);
            
            // Convert permissions to object format
            const permissionsObj = {};
            const allPermissions = ['queries', 'quotations', 'purchase_orders', 'invoices', 'admin'];
            
            // If role is admin, grant all permissions
            if (formData.get('role') === 'admin') {
                allPermissions.forEach(perm => {
                    permissionsObj[perm] = true;
                });
            } else {
                allPermissions.forEach(perm => {
                    permissionsObj[perm] = permissions.includes(perm);
                });
            }
            
            const userData = {
                username: formData.get('username'),
                full_name: formData.get('full_name'),
                email: formData.get('email'),
                password: formData.get('password'),
                role: formData.get('role'),
                status: formData.get('status'),
                permissions: permissionsObj
            };
            
            try {
                const response = await fetch('/api/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
                    },
                    body: JSON.stringify(userData)
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showAlert('User created successfully', 'success');
                    const modal = bootstrap.Modal.getInstance(document.getElementById('createUserModal'));
                    modal.hide();
                    loadUsers();
                    loadUserStats();
                } else {
                    showAlert(result.error || 'Error creating user', 'danger');
                }
            } catch (error) {
                console.error('Error creating user:', error);
                showAlert('Error creating user', 'danger');
            }
        });
    }
});

// Edit user
async function editUser(userId) {
    try {
        const response = await fetch(`/api/users/${userId}`);
        if (response.ok) {
            const user = await response.json();
            
            // Populate edit form
            document.getElementById('editUserId').value = user.id;
            document.getElementById('editUsername').value = user.username;
            document.getElementById('editFullName').value = user.full_name || '';
            document.getElementById('editEmail').value = user.email || '';
            document.getElementById('editRole').value = user.role;
            document.getElementById('editStatus').value = user.status;
            
            // Set permissions
            const permissions = user.permissions ? (typeof user.permissions === 'string' ? user.permissions.split(',') : Object.keys(user.permissions).filter(key => user.permissions[key])) : [];
            document.querySelectorAll('#editUserModal input[name="permissions"]').forEach(cb => {
                cb.checked = permissions.includes(cb.value);
            });
            
            // Handle permission section visibility based on role
            const editPermissionsSection = document.getElementById('editPermissionsSection');
            if (user.role === 'admin') {
                editPermissionsSection.style.display = 'none';
            } else {
                editPermissionsSection.style.display = 'block';
            }
            
            const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
            modal.show();
        } else {
            showAlert('Error loading user data', 'danger');
        }
    } catch (error) {
        console.error('Error loading user:', error);
        showAlert('Error loading user data', 'danger');
    }
}

// Handle edit user form submission
document.addEventListener('DOMContentLoaded', function() {
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
        editUserForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const permissions = Array.from(document.querySelectorAll('#editUserModal input[name="permissions"]:checked'))
                .map(cb => cb.value);
            
            // Convert permissions to object format
            const permissionsObj = {};
            const allPermissions = ['queries', 'quotations', 'purchase_orders', 'invoices', 'admin'];
            
            // If role is admin, grant all permissions
            if (formData.get('role') === 'admin') {
                allPermissions.forEach(perm => {
                    permissionsObj[perm] = true;
                });
            } else {
                allPermissions.forEach(perm => {
                    permissionsObj[perm] = permissions.includes(perm);
                });
            }
            
            const userData = {
                full_name: formData.get('full_name'),
                email: formData.get('email'),
                role: formData.get('role'),
                status: formData.get('status'),
                permissions: permissionsObj
            };
            
            const userId = formData.get('user_id');
            
            try {
                const response = await fetch(`/api/users/${userId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
                    },
                    body: JSON.stringify(userData)
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showAlert('User updated successfully', 'success');
                    const modal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
                    modal.hide();
                    loadUsers();
                    loadUserStats();
                } else {
                    showAlert(result.error || 'Error updating user', 'danger');
                }
            } catch (error) {
                console.error('Error updating user:', error);
                showAlert('Error updating user', 'danger');
            }
        });
    }
});

// Reset user password
function resetUserPassword(userId, username) {
    document.getElementById('resetUserId').value = userId;
    document.getElementById('resetUserName').textContent = username;
    document.getElementById('resetPasswordForm').reset();
    
    const modal = new bootstrap.Modal(document.getElementById('resetPasswordModal'));
    modal.show();
}

// Handle reset password form submission
document.addEventListener('DOMContentLoaded', function() {
    const resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const newPassword = formData.get('new_password');
            const confirmPassword = formData.get('confirm_password');
            
            if (newPassword !== confirmPassword) {
                showAlert('Passwords do not match', 'danger');
                return;
            }
            
            const userId = formData.get('user_id');
            
            try {
                const response = await fetch(`/api/users/${userId}/password`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
                    },
                    body: JSON.stringify({ password: newPassword })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showAlert('Password reset successfully', 'success');
                    const modal = bootstrap.Modal.getInstance(document.getElementById('resetPasswordModal'));
                    modal.hide();
                } else {
                    showAlert(result.error || 'Error resetting password', 'danger');
                }
            } catch (error) {
                console.error('Error resetting password:', error);
                showAlert('Error resetting password', 'danger');
            }
        });
    }
});

// Deactivate user
async function deactivateUser(userId) {
    if (!confirm('Are you sure you want to deactivate this user?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE',
            headers: csrfToken ? { 'x-csrf-token': csrfToken } : {}
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert('User deactivated successfully', 'success');
            loadUsers();
            loadUserStats();
        } else {
            showAlert(result.error || 'Error deactivating user', 'danger');
        }
    } catch (error) {
        console.error('Error deactivating user:', error);
        showAlert('Error deactivating user', 'danger');
    }
}

// Toggle password visibility
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// System Settings Functions

// Load current user data into settings form
function loadAccountSettings() {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (currentUser) {
        document.getElementById('currentUsername').value = currentUser.username;
        document.getElementById('newFullName').value = currentUser.full_name || '';
        document.getElementById('newEmail').value = currentUser.email || '';
    }
}

// Handle account settings form submission
document.addEventListener('DOMContentLoaded', function() {
    const accountSettingsForm = document.getElementById('accountSettingsForm');
    if (accountSettingsForm) {
        accountSettingsForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
            const formData = new FormData(this);
            
            const userData = {
                full_name: document.getElementById('newFullName').value,
                email: document.getElementById('newEmail').value,
                role: currentUser.role,
                permissions: currentUser.permissions,
                is_active: 1
            };
            
            try {
                const response = await fetch(`/api/users/${currentUser.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(userData)
                });
                
                if (response.ok) {
                    showAlert('Profile updated successfully', 'success');
                    // Update session storage
                    currentUser.full_name = userData.full_name;
                    currentUser.email = userData.email;
                    sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
                    // Update UI
                    setupUserInterface(currentUser);
                } else {
                    const error = await response.json();
                    showAlert(error.error || 'Failed to update profile', 'danger');
                }
            } catch (error) {
                console.error('Error updating profile:', error);
                showAlert('Error updating profile', 'danger');
            }
        });
    }
    
    // Handle password change form submission
    const passwordChangeForm = document.getElementById('passwordChangeForm');
    if (passwordChangeForm) {
        passwordChangeForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (newPassword !== confirmPassword) {
                showAlert('New passwords do not match', 'danger');
                return;
            }
            
            if (newPassword.length < 6) {
                showAlert('New password must be at least 6 characters long', 'danger');
                return;
            }
            
            try {
                // First verify current password by attempting login
                const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
                const verifyResponse = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        username: currentUser.username,
                        password: currentPassword
                    })
                });
                
                if (!verifyResponse.ok) {
                    showAlert('Current password is incorrect', 'danger');
                    return;
                }
                
                // Update password
                const response = await fetch(`/api/users/${currentUser.id}/password`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ password: newPassword })
                });
                
                if (response.ok) {
                    showAlert('Password changed successfully', 'success');
                    this.reset();
                } else {
                    const error = await response.json();
                    showAlert(error.error || 'Failed to change password', 'danger');
                }
            } catch (error) {
                console.error('Error changing password:', error);
                showAlert('Error changing password', 'danger');
            }
        });
    }
});

// System action functions
async function backupDatabase() {
    try {
        showAlert('Database backup initiated...', 'info');
        
        const response = await fetch('/api/admin/backup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            showAlert(`Database backup completed: ${result.backupFile}`, 'success');
            document.getElementById('lastBackupTime').textContent = new Date(result.timestamp).toLocaleString();
        } else {
            const error = await response.json();
            showAlert(error.error || 'Failed to backup database', 'danger');
        }
    } catch (error) {
        console.error('Error backing up database:', error);
        showAlert('Error backing up database', 'danger');
    }
}

async function clearOldSessions() {
    try {
        showAlert('Clearing old sessions...', 'info');
        
        const response = await fetch('/api/admin/clear-sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            showAlert(`${result.message} (${result.deletedCount} sessions removed)`, 'success');
        } else {
            const error = await response.json();
            showAlert(error.error || 'Failed to clear sessions', 'danger');
        }
    } catch (error) {
        console.error('Error clearing sessions:', error);
        showAlert('Error clearing old sessions', 'danger');
    }
}

function viewSystemLogs() {
    showAlert('System logs feature will be implemented in future version', 'info');
}

// Load system information
async function loadSystemInfo() {
    try {
        const response = await fetch('/api/admin/system-info');
        
        if (response.ok) {
            const systemInfo = await response.json();
            
            // Update system information display
            document.getElementById('systemVersion').textContent = systemInfo.version;
            document.getElementById('databaseType').textContent = systemInfo.database.type;
            if (systemInfo.database.path) {
                document.getElementById('databasePath').textContent = systemInfo.database.path;
            }
            document.getElementById('databaseSize').textContent = systemInfo.database.size;
            document.getElementById('serverStatus').textContent = systemInfo.server.status;
            document.getElementById('serverUptime').textContent = systemInfo.server.uptime;
            document.getElementById('nodeVersion').textContent = systemInfo.server.nodeVersion;
            
            // Update statistics
            document.getElementById('totalUsersCount').textContent = systemInfo.statistics.totalUsers;
            document.getElementById('totalQueriesCount').textContent = systemInfo.statistics.totalQueries;
            document.getElementById('activeSessionsCount').textContent = systemInfo.statistics.activeSessions;
            
            // Update last backup time if available
            if (systemInfo.database.lastModified) {
                document.getElementById('lastBackupTime').textContent = new Date(systemInfo.database.lastModified).toLocaleString();
            }
        } else {
            console.error('Failed to load system information');
        }
    } catch (error) {
        console.error('Error loading system info:', error);
    }
}

// Update showModule function to handle admin module
const originalShowModule = showModule;
showModule = function(moduleName) {
    if (moduleName === 'admin') {
        // Hide all modules
        document.querySelectorAll('.module-content').forEach(module => {
            module.classList.add('d-none');
        });
        
        // Show admin module
        document.getElementById('admin-module').classList.remove('d-none');
        
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        event.target.classList.add('active');
        
        currentModule = 'admin';
        showAdminModule();
        loadAccountSettings(); // Load current user data
        loadSystemInfo(); // Load system information
        loadUsersForFilter(); // Load users for history filter
    } else {
        originalShowModule(moduleName);
    }
};

// Activity History Functions
let currentHistoryPage = 1;
const historyItemsPerPage = 20;

// Load users for the filter dropdown
function loadUsersForFilter() {
    fetch('/api/users')
        .then(response => response.json())
        .then(users => {
            const userFilter = document.getElementById('userFilter');
            // Clear existing options except "All Users"
            userFilter.innerHTML = '<option value="">All Users</option>';
            
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.username;
                userFilter.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error loading users:', error);
        });
}

// Load activity logs with filters and pagination
function loadActivityLogs(page = 1) {
    currentHistoryPage = page;
    
    const actionFilter = document.getElementById('actionFilter').value;
    const entityFilter = document.getElementById('entityFilter').value;
    const userFilter = document.getElementById('userFilter').value;
    
    const params = new URLSearchParams({
        page: page,
        limit: historyItemsPerPage
    });
    
    if (actionFilter) params.append('action', actionFilter);
    if (entityFilter) params.append('entity_type', entityFilter);
    if (userFilter) params.append('user_id', userFilter);
    
    fetch(`/api/admin/activity-logs?${params}`)
        .then(response => response.json())
        .then(data => {
            displayActivityLogs(data.logs);
            updateHistoryPagination(data.pagination);
        })
        .catch(error => {
            console.error('Error loading activity logs:', error);
            document.getElementById('activityLogsTableBody').innerHTML = 
                '<tr><td colspan="7" class="text-center text-danger">Error loading activity logs</td></tr>';
        });
}

// Display activity logs in the table
function displayActivityLogs(logs) {
    const tbody = document.getElementById('activityLogsTableBody');
    
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No activity logs found</td></tr>';
        return;
    }
    
    tbody.innerHTML = logs.map(log => {
        const date = new Date(log.created_at).toLocaleString();
        const actionBadge = getActionBadge(log.action);
        const entityBadge = getEntityBadge(log.entity_type);
        const fileInfo = log.file_path ? `<small class="text-muted">${log.file_path.split('/').pop()}</small>` : '-';
        
        return `
            <tr>
                <td><small>${date}</small></td>
                <td><strong>${log.username}</strong></td>
                <td>${actionBadge}</td>
                <td>${entityBadge}</td>
                <td><small>${log.description || '-'}</small></td>
                <td>${fileInfo}</td>
                <td><small class="text-muted">${log.ip_address || '-'}</small></td>
            </tr>
        `;
    }).join('');
}

// Get badge HTML for action type
function getActionBadge(action) {
    const badges = {
        'create': '<span class="badge bg-success">Create</span>',
        'update': '<span class="badge bg-warning">Update</span>',
        'delete': '<span class="badge bg-danger">Delete</span>',
        'export': '<span class="badge bg-info">Export</span>',
        'backup': '<span class="badge bg-secondary">Backup</span>'
    };
    return badges[action] || `<span class="badge bg-light text-dark">${action}</span>`;
}

// Get badge HTML for entity type
function getEntityBadge(entityType) {
    const badges = {
        'query': '<span class="badge bg-primary">Query</span>',
        'quotation': '<span class="badge bg-success">Quotation</span>',
        'purchase_order': '<span class="badge bg-warning text-dark">Purchase Order</span>',
        'system': '<span class="badge bg-dark">System</span>'
    };
    return badges[entityType] || `<span class="badge bg-light text-dark">${entityType}</span>`;
}

// Update pagination for history
function updateHistoryPagination(pagination) {
    const paginationContainer = document.getElementById('historyPagination');
    
    if (pagination.totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // Previous button
    if (pagination.currentPage > 1) {
        paginationHTML += `
            <li class="page-item">
                <a class="page-link" href="#" onclick="loadActivityLogs(${pagination.currentPage - 1})">
                    <i class="fas fa-chevron-left"></i>
                </a>
            </li>
        `;
    }
    
    // Page numbers
    const startPage = Math.max(1, pagination.currentPage - 2);
    const endPage = Math.min(pagination.totalPages, pagination.currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        const isActive = i === pagination.currentPage ? 'active' : '';
        paginationHTML += `
            <li class="page-item ${isActive}">
                <a class="page-link" href="#" onclick="loadActivityLogs(${i})">${i}</a>
            </li>
        `;
    }
    
    // Next button
    if (pagination.currentPage < pagination.totalPages) {
        paginationHTML += `
            <li class="page-item">
                <a class="page-link" href="#" onclick="loadActivityLogs(${pagination.currentPage + 1})">
                    <i class="fas fa-chevron-right"></i>
                </a>
            </li>
        `;
    }
    
    paginationContainer.innerHTML = paginationHTML;
}

// Clear history filters
function clearHistoryFilters() {
    document.getElementById('actionFilter').value = '';
    document.getElementById('entityFilter').value = '';
    document.getElementById('userFilter').value = '';
    loadActivityLogs(1);
}

// Load activity logs when history tab is shown
document.addEventListener('DOMContentLoaded', function() {
    const historyTab = document.getElementById('history-tab');
    if (historyTab) {
        historyTab.addEventListener('shown.bs.tab', function() {
            loadActivityLogs(1);
        });
    }
});
// Initialize CSRF token
async function initCsrfToken() {
    try {
        const resp = await fetch('/api/csrf-token', { credentials: 'include' });
        if (resp.ok) {
            const data = await resp.json();
            csrfToken = data.csrfToken;
        }
    } catch (e) {
        // If not authenticated yet, token will be fetched after login
        console.warn('CSRF token init skipped:', e.message);
    }
}
