import Fuse from 'fuse.js';
import Store from './store/index.js';
import {
    addItem,
    removeItem,
    highlightItem,
    addChoice,
    filterChoices,
    activateChoices,
    addGroup,
    clearAll,
} from './actions/index';
import {
    isScrolledIntoView,
    getAdjacentEl,
    wrap,
    isType,
    isElement,
    strToEl,
    extend,
    getWidthOfInput,
    sortByAlpha,
    sortByScore,
} from './lib/utils.js';
import './lib/polyfills.js';


/**
 * Choices
 */
export default class Choices {
    constructor(element = '[data-choice]', userConfig = {}) {
        // If there are multiple elements, create a new instance
        // for each element besides the first one (as that already has an instance)
        if (isType('String', element)) {
            const elements = document.querySelectorAll(element);
            if (elements.length > 1) {
                for (let i = 1; i < elements.length; i++) {
                    const el = elements[i];
                    new Choices(el, userConfig);
                }
            }
        }

        const defaultConfig = {
            items: [],
            choices: [],
            maxItemCount: -1,
            addItems: true,
            removeItems: true,
            removeItemButton: false,
            editItems: false,
            duplicateItems: true,
            delimiter: ',',
            paste: true,
            search: true,
            flip: true,
            regexFilter: null,
            sortFilter: sortByAlpha,
            sortFields: ['label', 'value'],
            placeholder: true,
            placeholderValue: null,
            prependValue: null,
            appendValue: null,
            loadingText: 'Loading...',
            noResultsText: 'No results round',
            noChoicesText: 'No choices to choose from',
            classNames: {
                containerOuter: 'choices',
                containerInner: 'choices__inner',
                input: 'choices__input',
                inputCloned: 'choices__input--cloned',
                list: 'choices__list',
                listItems: 'choices__list--multiple',
                listSingle: 'choices__list--single',
                listDropdown: 'choices__list--dropdown',
                item: 'choices__item',
                itemSelectable: 'choices__item--selectable',
                itemDisabled: 'choices__item--disabled',
                itemChoice: 'choices__item--choice',
                placeholder: 'choices__placeholder',
                group: 'choices__group',
                groupHeading: 'choices__heading',
                button: 'choices__button',
                activeState: 'is-active',
                focusState: 'is-focused',
                openState: 'is-open',
                disabledState: 'is-disabled',
                highlightedState: 'is-highlighted',
                hiddenState: 'is-hidden',
                flippedState: 'is-flipped',
                loadingState: 'is-loading',
            },
            callbackOnInit: () => {},
            callbackOnAddItem: (id, value, passedInput) => {},
            callbackOnRemoveItem: (id, value, passedInput) => {},
            callbackOnHighlightItem: (id, value, passedInput) => {},
            callbackOnUnhighlightItem: (id, value, passedInput) => {},
            callbackOnChange: (value, passedInput) => {},
        };

        // Merge options with user options
        this.config = extend(defaultConfig, userConfig);

        // Create data store
        this.store = new Store(this.render);

        // State tracking
        this.initialised = false;
        this.currentState = {};
        this.prevState = {};
        this.currentValue = '';

        // Retrieve triggering element (i.e. element with 'data-choice' trigger)
        this.passedElement = isType('String', element) ? document.querySelector(element) : element;

        this.highlightPosition = 0;
        this.canSearch = this.config.search;

        // Assing preset choices from passed object
        this.presetChoices = this.config.choices;

        // Assign preset items from passed object first
        this.presetItems = this.config.items;

        // Then add any values passed from attribute
        if (this.passedElement.value) {
            this.presetItems = this.presetItems.concat(this.passedElement.value.split(this.config.delimiter));
        }

        // Bind methods
        this.init = this.init.bind(this);
        this.render = this.render.bind(this);
        this.destroy = this.destroy.bind(this);
        this.disable = this.disable.bind(this);

        // Bind event handlers
        this._onFocus = this._onFocus.bind(this);
        this._onBlur = this._onBlur.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onClick = this._onClick.bind(this);
        this._onTouchMove = this._onTouchMove.bind(this);
        this._onTouchEnd = this._onTouchEnd.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseOver = this._onMouseOver.bind(this);
        this._onPaste = this._onPaste.bind(this);
        this._onInput = this._onInput.bind(this);

        // Focus containerOuter but not show dropdown if true
        this.focusAndHideDropdown = false;

        // Monitor touch taps/scrolls
        this.wasTap = true;

        // Cutting the mustard
        const cuttingTheMustard = 'querySelector' in document && 'addEventListener' in document && 'classList' in document.createElement('div');
        if (!cuttingTheMustard) console.error('Choices: Your browser doesn\'t support Choices');

        // Input type check
        const canInit = this.passedElement && isElement(this.passedElement) && ['select-one', 'select-multiple', 'text'].some(type => type === this.passedElement.type);

        if (canInit) {
            // If element has already been initalised with Choices
            if (this.passedElement.getAttribute('data-choice') === 'active') return;

            // Let's go
            this.init();
        } else {
            console.error('Incompatible input passed');
        }
    }

    /**
     * Initialise Choices
     * @return
     * @public
     */
    init(callback = this.config.callbackOnInit) {
        if (this.initialised !== true) {
            // Set initialise flag
            this.initialised = true;

            // Create required elements
            this._createTemplates();

            // Generate input markup
            this._createInput();

            this.store.subscribe(this.render);

            // Render any items
            this.render();

            // Trigger event listeners
            this._addEventListeners();

            // Run callback if it is a function
            if (callback) {
                if (isType('Function', callback)) {
                    callback();
                } else {
                    console.error('callbackOnInit: Callback is not a function');
                }
            }
        }
    }

    /**
     * Destroy Choices and nullify values
     * @return
     * @public
     */
    destroy() {
        this._removeEventListeners();

        this.passedElement.classList.remove(this.config.classNames.input, this.config.classNames.hiddenState);
        this.passedElement.tabIndex = '';
        this.passedElement.removeAttribute('style', 'display:none;');
        this.passedElement.removeAttribute('aria-hidden');

        this.containerOuter.outerHTML = this.passedElement.outerHTML;

        this.passedElement = null;
        this.userConfig = null;
        this.config = null;
        this.store = null;
    }

    /**
     * Select item (a selected item can be deleted)
     * @param  {Element} item Element to select
     * @return {Object} Class instance
     * @public
     */
    highlightItem(item) {
        if (!item) return;
        const id = item.id;
        this.store.dispatch(highlightItem(id, true));

        // Run callback if it is a function
        if (this.config.callbackOnHighlightItem) {
            const callback = this.config.callbackOnHighlightItem;
            if (isType('Function', callback)) {
                callback(id, item.value, this.passedElement);
            } else {
                console.error('callbackOnHighlightItem: Callback is not a function');
            }
        }

        return this;
    }

    /**
     * Deselect item
     * @param  {Element} item Element to de-select
     * @return {Object} Class instance
     * @public
     */
    unhighlightItem(item) {
        if (!item) return;
        const id = item.id;
        this.store.dispatch(highlightItem(id, false));

        // Run callback if it is a function
        if (this.config.callbackOnUnhighlightItem) {
            const callback = this.config.callbackOnUnhighlightItem;
            if (isType('Function', callback)) {
                callback(id, item.value, this.passedElement);
            } else {
                console.error('callbackOnUnhighlightItem: Callback is not a function');
            }
        }

        return this;
    }

    /**
     * Highlight items within store
     * @return {Object} Class instance
     * @public
     */
    highlightAll() {
        const items = this.store.getItems();
        items.forEach((item) => {
            this.highlightItem(item);
        });

        return this;
    }

    /**
     * Deselect items within store
     * @return {Object} Class instance
     * @public
     */
    unhighlightAll() {
        const items = this.store.getItems();
        items.forEach((item) => {
            this.unhighlightItem(item);
        });

        return this;
    }

    /**
     * Remove an item from the store by its value
     * @param  {String} value Value to search for
     * @return {Object} Class instance
     * @public
     */
    removeItemsByValue(value) {
        if (!value || !isType('String', value)) {
            console.error('removeItemsByValue: No value was passed to be removed');
            return;
        }

        const items = this.store.getItemsFilteredByActive();

        items.forEach((item) => {
            if (item.value === value) {
                this._removeItem(item);
            }
        });

        return this;
    }

    /**
     * Remove all items from store array
     * @note Removed items are soft deleted
     * @param  {Number} excludedId Optionally exclude item by ID
     * @return {Object} Class instance
     * @public
     */
    removeActiveItems(excludedId) {
        const items = this.store.getItemsFilteredByActive();

        items.forEach((item) => {
            if (item.active && excludedId !== item.id) {
                this._removeItem(item);
            }
        });

        return this;
    }

    /**
     * Remove all selected items from store
     * @note Removed items are soft deleted
     * @return {Object} Class instance
     * @public
     */
    removeHighlightedItems() {
        const items = this.store.getItemsFilteredByActive();

        items.forEach((item) => {
            if (item.highlighted && item.active) {
                this._removeItem(item);
            }
        });

        return this;
    }

    /**
     * Show dropdown to user by adding active state class
     * @return {Object} Class instance
     * @public
     */
    showDropdown(focusInput = false) {
        const body = document.body;
        const html = document.documentElement;
        const winHeight = Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight);

        this.containerOuter.classList.add(this.config.classNames.openState);
        this.containerOuter.setAttribute('aria-expanded', 'true');
        this.dropdown.classList.add(this.config.classNames.activeState);

        const dimensions = this.dropdown.getBoundingClientRect();
        const dropdownPos = Math.ceil(dimensions.top + window.scrollY + dimensions.height);
        // If flip is enabled and the dropdown bottom position is greater than the window height flip the dropdown.
        const shouldFlip = this.config.flip ? dropdownPos >= winHeight : false;

        if (shouldFlip) {
            this.containerOuter.classList.add(this.config.classNames.flippedState);
        } else {
            this.containerOuter.classList.remove(this.config.classNames.flippedState);
        }

        // Optionally focus the input if we have a search input
        if (focusInput && this.canSearch && document.activeElement !== this.input) {
            this.input.focus();
        }

        return this;
    }

    /**
     * Hide dropdown from user
     * @return {Object} Class instance
     * @public
     */
    hideDropdown(blurInput = false) {
        // A dropdown flips if it does not have space within the page
        const isFlipped = this.containerOuter.classList.contains(this.config.classNames.flippedState);

        this.containerOuter.classList.remove(this.config.classNames.openState);
        this.containerOuter.setAttribute('aria-expanded', 'false');

        this.dropdown.classList.remove(this.config.classNames.activeState);

        if (isFlipped) {
            this.containerOuter.classList.remove(this.config.classNames.flippedState);
        }

        // Optionally blur the input if we have a search input
        if (blurInput && this.canSearch && document.activeElement === this.input) {
            this.input.blur();
        }

        return this;
    }

    /**
     * Determine whether to hide or show dropdown based on its current state
     * @return {Object} Class instance
     * @public
     */
    toggleDropdown() {
        const hasActiveDropdown = this.dropdown.classList.contains(this.config.classNames.activeState);
        if (hasActiveDropdown) {
            this.hideDropdown();
        } else {
            this.showDropdown(true);
        }

        return this;
    }

    /**
     * Get value(s) of input (i.e. inputted items (text) or selected choices (select))
     * @param {Boolean} valueOnly Get only values of selected items, otherwise return selected items
     * @return {Array/String} selected value (select-one) or array of selected items (inputs & select-multiple)
     * @public
     */
    getValue(valueOnly = false) {
        const items = this.store.getItemsFilteredByActive();
        const selectedItems = [];

        items.forEach((item) => {
            if (this.passedElement.type === 'text') {
                selectedItems.push(valueOnly ? item.value : item);
            } else if (item.active) {
                selectedItems.push(valueOnly ? item.value : item);
            }
        });

        if (this.passedElement.type === 'select-one') {
            return selectedItems[0];
        }

        return selectedItems;
    }

    /**
     * Set value of input. If the input is a select box, a choice will be created and selected otherwise
     * an item will created directly.
     * @param {Array} args Array of value objects or value strings
     * @return {Object} Class instance
     * @public
     */
    setValue(args) {
        if (this.initialised === true) {
            // Convert args to an itterable array
            const values = [...args];

            values.forEach((item) => {
                if (isType('Object', item)) {
                    if (!item.value) return;
                    // If we are dealing with a select input, we need to create an option first
                    // that is then selected. For text inputs we can just add items normally.
                    if (this.passedElement.type !== 'text') {
                        this._addChoice(true, false, item.value, item.label, -1);
                    } else {
                        this._addItem(item.value, item.label, item.id);
                    }
                } else if (isType('String', item)) {
                    if (this.passedElement.type !== 'text') {
                        this._addChoice(true, false, item, item, -1);
                    } else {
                        this._addItem(item);
                    }
                }
            });
        }

        return this;
    }

    /**
     * Select value of select box via the value of an existing choice
     * @param {Array/String} value An array of strings of a single string
     * @return {Object} Class instance
     * @public
     */
    setValueByChoice(value) {
        if (this.passedElement.type !== 'text') {
            const choices = this.store.getChoices();
            // If only one value has been passed, convert to array
            const choiceValue = isType('Array', value) ? value : [value];

            // Loop through each value and
            choiceValue.forEach((val) => {
                const foundChoice = choices.find((choice) => {
                    // Check 'value' property exists and the choice isn't already selected
                    return choice.value === val;
                });

                if (foundChoice) {
                    if (!foundChoice.selected) {
                        this._addItem(foundChoice.value, foundChoice.label, foundChoice.id);
                    } else {
                        console.warn('Attempting to select choice already selected');
                    }
                } else {
                    console.warn('Attempting to select choice that does not exist');
                }
            });
        }
        return this;
    }

    /**
    * Direct populate choices
    * @param  {Array} choices - Choices to insert
    * @param  {String} value - Name of 'value' property
    * @param  {String} label - Name of 'label' property
    * @return {Object} Class instance
    * @public
    */
    setChoices(choices, value, label) {
        if (this.initialised === true) {
            if (this.passedElement.type === 'select-one' || this.passedElement.type === 'select-multiple') {
                if (!isType('Array', choices) || !value) return;

                if (choices && choices.length) {
                    this.containerOuter.classList.remove(this.config.classNames.loadingState);
                    choices.forEach((result, index) => {
                        if (result.choices) {
                            this._addGroup(result, index);
                        } else {
                            this._addChoice(result.selected ? result.selected : false, result.disabled ? result.disabled : false, result[value], result[label]);
                        }
                    });
                }
            }
        }
        return this;
    }

    /**
     * Clear items,choices and groups
     * @note Hard delete
     * @return {Object} Class instance
     * @public
     */
    clearStore() {
        this.store.dispatch(clearAll());
        return this;
    }

    /**
     * Set value of input to blank
     * @return {Object} Class instance
     * @public
     */
    clearInput() {
        if (this.input.value) this.input.value = '';
        if (this.passedElement.type !== 'select-one') {
            this.input.style.width = getWidthOfInput(this.input);
        }
        return this;
    }

    /**
     * Disable interaction with Choices
     * @return {Object} Class instance
     * @public
     */
    disable() {
        this.passedElement.disabled = true;
        if (this.initialised) {
            if (!this.containerOuter.classList.contains(this.config.classNames.disabledState)) {
                this._removeEventListeners();
                this.passedElement.setAttribute('disabled', '');
                this.input.setAttribute('disabled', '');
                this.containerOuter.classList.add(this.config.classNames.disabledState);
                this.containerOuter.setAttribute('aria-disabled', 'true');
            }
        }
        return this;
    }

    /**
     * Enable interaction with Choices
     * @return {Object} Class instance
     */
    enable() {
        this.passedElement.disabled = false;
        if (this.initialised) {
            if (this.containerOuter.classList.contains(this.config.classNames.disabledState)) {
                this._addEventListeners();
                this.passedElement.removeAttribute('disabled');
                this.input.removeAttribute('disabled');
                this.containerOuter.classList.remove(this.config.classNames.disabledState);
                this.containerOuter.removeAttribute('aria-disabled');
            }
        }
        return this;
    }

    /**
     * Populate options via ajax callback
     * @param  {Function} fn Passed
     * @return {Object} Class instance
     * @public
     */
    ajax(fn) {
        if (this.initialised === true) {
            if (this.passedElement.type === 'select-one' || this.passedElement.type === 'select-multiple') {
                this.containerOuter.classList.add(this.config.classNames.loadingState);
                this.containerOuter.setAttribute('aria-busy', 'true');
                if (this.passedElement.type === 'select-one') {
                    const placeholderItem = this._getTemplate('placeholder', this.config.loadingText);
                    this.itemList.appendChild(placeholderItem);
                } else {
                    this.input.placeholder = this.config.loadingText;
                }

                const callback = (results, value, label) => {
                    if (!isType('Array', results) || !value) return;
                    if (results && results.length) {
                        // Remove loading states/text
                        this.containerOuter.classList.remove(this.config.classNames.loadingState);
                        if (this.passedElement.type === 'select-multiple') {
                            const placeholder = this.config.placeholder ? this.config.placeholderValue || this.passedElement.getAttribute('placeholder') : false;
                            if (placeholder) {
                                this.input.placeholder = placeholder;
                            }
                        }

                        // Add each result as a choice
                        results.forEach((result, index) => {
                            // Select first choice in list if single select input
                            if (index === 0 && this.passedElement.type === 'select-one') {
                                this._addChoice(true, false, result[value], result[label]);
                            } else {
                                this._addChoice(false, false, result[value], result[label]);
                            }
                        });
                    }
                    this.containerOuter.removeAttribute('aria-busy');
                };
                fn(callback);
            }
        }
        return this;
    }

    /**
     * Call change callback
     * @param  {String} value - last added/deleted/selected value
     * @return
     * @private
     */
    _triggerChange(value) {
        if (!value) return;

        // Run callback if it is a function
        if (this.config.callbackOnChange) {
            const callback = this.config.callbackOnChange;
            if (isType('Function', callback)) {
                callback(value, this.passedElement);
            } else {
                console.error('callbackOnChange: Callback is not a function');
            }
        }

        // Keep focus on select-one element
        if (this.passedElement.type === 'select-one') {
            this.focusAndHideDropdown = true;
            this.containerOuter.focus();
        }
    }


    /**
     * Process enter/click of an item button
     * @param {Array} activeItems The currently active items
     * @param  {Element} element Button being interacted with
     * @return
     * @private
     */
    _handleButtonAction(activeItems, element) {
        if (!activeItems || !element) return;

        // If we are clicking on a button
        if (this.config.removeItems && this.config.removeItemButton) {
            const itemId = element.parentNode.getAttribute('data-id');
            const itemToRemove = activeItems.find((item) => item.id === parseInt(itemId, 10));

            // Remove item associated with button
            this._removeItem(itemToRemove);
            this._triggerChange(itemToRemove.value);

            if (this.passedElement.type === 'select-one') {
                const placeholder = this.config.placeholder ? this.config.placeholderValue || this.passedElement.getAttribute('placeholder') : false;
                if (placeholder) {
                    const placeholderItem = this._getTemplate('placeholder', placeholder);
                    this.itemList.appendChild(placeholderItem);
                }
            }
        }
    }

    /**
     * Process click of an item
     * @param {Array} activeItems The currently active items
     * @param  {Element} element Item being interacted with
     * @param  {Boolean} hasShiftKey Whether the user has the shift key active
     * @return
     * @private
     */
    _handleItemAction(activeItems, element, hasShiftKey = false) {
        if (!activeItems || !element) return;

        // If we are clicking on an item
        if (this.config.removeItems && this.passedElement.type !== 'select-one') {
            const passedId = element.getAttribute('data-id');

            // We only want to select one item with a click
            // so we deselect any items that aren't the target
            // unless shift is being pressed
            activeItems.forEach((item) => {
                if (item.id === parseInt(passedId, 10) && !item.highlighted) {
                    this.highlightItem(item);
                } else if (!hasShiftKey) {
                    if (item.highlighted) {
                        this.unhighlightItem(item);
                    }
                }
            });

            // Focus input as without focus, a user cannot do anything with a
            // highlighted item
            if (document.activeElement !== this.input) this.input.focus();
        }
    }

    /**
     * Process click of a choice
     * @param {Array} activeItems The currently active items
     * @param  {Element} element Choice being interacted with
     * @return {[type]}             [description]
     */
    _handleChoiceAction(activeItems, element) {
        if (!activeItems || !element) return;

        // If we are clicking on an option
        const id = element.getAttribute('data-id');
        const choice = this.store.getChoiceById(id);
        const hasActiveDropdown = this.dropdown.classList.contains(this.config.classNames.activeState);

        if (choice && !choice.selected && !choice.disabled) {
            const canAddItem = this._canAddItem(activeItems, choice.value);

            if (canAddItem.response) {
                this._addItem(choice.value, choice.label, choice.id);
                this._triggerChange(choice.value);
                this.clearInput(this.passedElement);
                this.isSearching = false;
                this.store.dispatch(activateChoices(true));

                // We only hide the dropdown on a choice selection for single select boxes
                if (this.passedElement.type === 'select-one' && hasActiveDropdown) {
                    this.hideDropdown();
                }
            }
        }
    }

    /**
     * Process back space event
     * @param  {Array} Active items
     * @return
     * @private
     */
    _handleBackspace(activeItems) {
        if (this.config.removeItems && activeItems) {
            const lastItem = activeItems[activeItems.length - 1];
            const hasHighlightedItems = activeItems.some((item) => item.highlighted === true);

            // If editing the last item is allowed and there are not other selected items,
            // we can edit the item value. Otherwise if we can remove items, remove all selected items
            if (this.config.editItems && !hasHighlightedItems && lastItem) {
                this.input.value = lastItem.value;
                this._removeItem(lastItem);
                this._triggerChange(lastItem.value);
            } else {
                if (!hasHighlightedItems) { this.highlightItem(lastItem); }
                this.removeHighlightedItems();
            }
        }
    }

    /**
     * Validates whether an item can be added by a user
     * @param {Array} activeItems The currently active items
     * @param  {String} value     Value of item to add
     * @return {Object}           Response: Whether user can add item
     *                            Notice: Notice show in dropdown
     */
    _canAddItem(activeItems, value) {
        let canAddItem = true;
        let notice = `Press Enter to add "${value}"`;

        if (this.passedElement.type === 'select-multiple' || this.passedElement.type === 'text') {
            if (this.config.maxItemCount > 0 && this.config.maxItemCount <= this.itemList.children.length) {
                // If there is a max entry limit and we have reached that limit
                // don't update
                canAddItem = false;
                notice = `Only ${this.config.maxItemCount} values can be added.`;
            }
        }

        if (this.passedElement.type === 'text' && this.config.addItems) {
            const isUnique = !activeItems.some((item) => item.value === value);

            // If a user has supplied a regular expression filter
            if (this.config.regexFilter) {
                // Determine whether we can update based on whether
                // our regular expression passes
                canAddItem = this._regexFilter(value);
            }

            // If no duplicates are allowed, and the value already exists
            // in the array
            if (this.config.duplicateItems === false && !isUnique) {
                canAddItem = false;
                notice = 'Only unique values can be added.';
            }
        }

        return {
            response: canAddItem,
            notice,
        };
    }

    /**
     * Filter choices based on search value
     * @param  {String} value Value to filter by
     * @return
     * @private
     */
    _searchChoices(value) {
        if (!value) return;
        if (this.input === document.activeElement) {
            const choices = this.store.getChoices();
            const hasUnactiveChoices = choices.some((option) => option.active !== true);

            // Check that we have a value to search and the input was an alphanumeric character
            if (value && value.length > 1) {
                const handleFilter = () => {
                    const newValue = isType('String', value) ? value.trim() : value;
                    const currentValue = isType('String', this.currentValue) ? this.currentValue.trim() : this.currentValue;

                    if (newValue.length >= 1 && newValue !== `${currentValue} `) {
                        const haystack = this.store.getChoicesFilteredBySelectable();
                        const needle = newValue;
                        const keys = isType('Array', this.config.sortFields) ? this.config.sortFields : [this.config.sortFields];
                        const fuse = new Fuse(haystack, {
                            keys,
                            shouldSort: true,
                            include: 'score',
                        });
                        const results = fuse.search(needle);

                        this.currentValue = newValue;
                        this.highlightPosition = 0;
                        this.isSearching = true;
                        this.store.dispatch(filterChoices(results));
                    }
                };

                handleFilter();
            } else if (hasUnactiveChoices) {
                // Otherwise reset choices to active
                this.isSearching = false;
                this.store.dispatch(activateChoices(true));
            }
        }
    }

    /**
     * Trigger event listeners
     * @return
     * @private
     */
    _addEventListeners() {
        document.addEventListener('keyup', this._onKeyUp);
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('click', this._onClick);
        document.addEventListener('touchmove', this._onTouchMove);
        document.addEventListener('touchend', this._onTouchEnd);
        document.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('mouseover', this._onMouseOver);

        if (this.passedElement.type && this.passedElement.type === 'select-one') {
            this.containerOuter.addEventListener('focus', this._onFocus);
            this.containerOuter.addEventListener('blur', this._onBlur);
        }

        this.input.addEventListener('input', this._onInput);
        this.input.addEventListener('paste', this._onPaste);
        this.input.addEventListener('focus', this._onFocus);
        this.input.addEventListener('blur', this._onBlur);
    }

    /**
     * Destroy event listeners
     * @return
     * @private
     */
    _removeEventListeners() {
        document.removeEventListener('keyup', this._onKeyUp);
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('click', this._onClick);
        document.removeEventListener('touchmove', this._onTouchMove);
        document.removeEventListener('touchend', this._onTouchEnd);
        document.removeEventListener('mousedown', this._onMouseDown);
        document.removeEventListener('mouseover', this._onMouseOver);

        if (this.passedElement.type && this.passedElement.type === 'select-one') {
            this.containerOuter.removeEventListener('focus', this._onFocus);
            this.containerOuter.removeEventListener('blur', this._onBlur);
        }

        this.input.removeEventListener('input', this._onInput);
        this.input.removeEventListener('paste', this._onPaste);
        this.input.removeEventListener('focus', this._onFocus);
        this.input.removeEventListener('blur', this._onBlur);
    }

    /**
     * Key down event
     * @param  {Object} e Event
     * @return
     */
    _onKeyDown(e) {
        if (e.target !== this.input && !this.containerOuter.contains(e.target)) return;

        const target = e.target;

        const ctrlDownKey = e.ctrlKey || e.metaKey;
        const backKey = 46;
        const deleteKey = 8;
        const enterKey = 13;
        const aKey = 65;
        const escapeKey = 27;
        const upKey = 38;
        const downKey = 40;

        const activeItems = this.store.getItemsFilteredByActive();
        const hasFocusedInput = this.input === document.activeElement;
        const hasActiveDropdown = this.dropdown.classList.contains(this.config.classNames.activeState);
        const hasItems = this.itemList && this.itemList.children;
        const keyString = String.fromCharCode(e.keyCode);

        // If a user is typing and the dropdown is not active
        if (this.passedElement.type !== 'text' && /[a-zA-Z0-9-_ ]/.test(keyString) && !hasActiveDropdown) {
            this.showDropdown();
        }

        this.canSearch = this.config.search;

        switch (e.keyCode) {
            case aKey:
                // If CTRL + A or CMD + A have been pressed and there are items to select
                if (ctrlDownKey && hasItems) {
                    this.canSearch = false;
                    if (this.config.removeItems && !this.input.value && this.input === document.activeElement) {
                        // Highlight items
                        this.highlightAll(this.itemList.children);
                    }
                }
                break;

            case enterKey:
                // If enter key is pressed and the input has a value
                if (this.passedElement.type === 'text' && target.value) {
                    const value = this.input.value;
                    const canAddItem = this._canAddItem(activeItems, value);

                    // All is good, add
                    if (canAddItem.response) {
                        if (hasActiveDropdown) {
                            this.hideDropdown();
                        }
                        this._addItem(value);
                        this._triggerChange(value);
                        this.clearInput(this.passedElement);
                    }
                }

                if (target.hasAttribute('data-button')) {
                    this._handleButtonAction(activeItems, target);
                    e.preventDefault();
                }

                if (hasActiveDropdown) {
                    const highlighted = this.dropdown.querySelector(`.${this.config.classNames.highlightedState}`);

                    if (highlighted) {
                        this._handleChoiceAction(activeItems, highlighted);
                    }

                    // We always want to hide the dropdown for single selects
                    // regardless of whether an item was added
                    if (hasActiveDropdown && this.passedElement.type === 'select-one') {
                        this.hideDropdown();
                    }
                } else if (this.passedElement.type === 'select-one') {
                    // Open single select dropdown if it's not active
                    if (!hasActiveDropdown) {
                        this.showDropdown(true);
                        e.preventDefault();
                    }
                }

                break;

            case escapeKey:
                if (hasActiveDropdown) this.toggleDropdown();
                break;

            case downKey:
            case upKey:
                // If up or down key is pressed, traverse through options
                if (hasActiveDropdown || this.passedElement.type === 'select-one') {
                    // Show dropdown if focus
                    if (!hasActiveDropdown) {
                        this.showDropdown(true);
                    }

                    const currentEl = this.dropdown.querySelector(`.${this.config.classNames.highlightedState}`);
                    const directionInt = e.keyCode === downKey ? 1 : -1;
                    let nextEl;

                    this.canSearch = false;

                    if (currentEl) {
                        nextEl = getAdjacentEl(currentEl, '[data-choice-selectable]', directionInt);
                    } else {
                        nextEl = this.dropdown.querySelector('[data-choice-selectable]');
                    }

                    if (nextEl) {
                        // We prevent default to stop the cursor moving
                        // when pressing the arrow
                        if (!isScrolledIntoView(nextEl, this.choiceList, directionInt)) {
                            this._scrollToChoice(nextEl, directionInt);
                        }
                        this._highlightChoice(nextEl);
                    }

                    // Prevent default to maintain cursor position whilst
                    // traversing dropdown options
                    e.preventDefault();
                }
                break;

            case backKey:
            case deleteKey:
                // If backspace or delete key is pressed and the input has no value
                if (hasFocusedInput && !e.target.value && this.passedElement.type !== 'select-one') {
                    this._handleBackspace(activeItems);
                    e.preventDefault();
                }

                break;

            default:
                break;
        }
    }

    /**
     * Key up event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onKeyUp(e) {
        if (e.target !== this.input) return;

        // We are typing into a text input and have a value, we want to show a dropdown
        // notice. Otherwise hide the dropdown
        if (this.passedElement.type === 'text') {
            const hasActiveDropdown = this.dropdown.classList.contains(this.config.classNames.activeState);
            const value = this.input.value;

            if (value) {
                const activeItems = this.store.getItemsFilteredByActive();
                const canAddItem = this._canAddItem(activeItems, value);

                if (canAddItem.notice) {
                    const dropdownItem = this._getTemplate('notice', canAddItem.notice);
                    this.dropdown.innerHTML = dropdownItem.outerHTML;
                }

                if (canAddItem.response === true) {
                    if (!hasActiveDropdown) {
                        this.showDropdown();
                    }
                } else if (!canAddItem.notice && hasActiveDropdown) {
                    this.hideDropdown();
                }
            } else if (hasActiveDropdown) {
                this.hideDropdown();
            }
        } else {
            const backKey = 46;
            const deleteKey = 8;

            // If user has removed value...
            if ((e.keyCode === backKey || e.keyCode === deleteKey) && !e.target.value) {
                // ...and it is a multiple select input, activate choices (if searching)
                if (this.passedElement.type !== 'text' && this.isSearching) {
                    this.isSearching = false;
                    this.store.dispatch(activateChoices(true));
                }
            } else if (this.canSearch) {
                this._searchChoices(this.input.value);
            }
        }
    }

    /**
     * Input event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onInput() {
        if (this.passedElement.type !== 'select-one') {
            if (this.config.placeholder && (this.config.placeholderValue || this.passedElement.getAttribute('placeholder'))) {
                // If there is a placeholder, we only want to set the width of the input when it is a greater
                // length than 75% of the placeholder. This stops the input jumping around.
                const placeholder = this.config.placeholder ? this.config.placeholderValue || this.passedElement.getAttribute('placeholder') : false;
                if (this.input.value && this.input.value.length >= (placeholder.length / 1.25)) {
                    this.input.style.width = getWidthOfInput(this.input);
                }
            } else {
                // If there is no placeholder, resize input to contents
                this.input.style.width = getWidthOfInput(this.input);
            }
        }
    }

    /**
     * Touch move event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onTouchMove() {
        if (this.wasTap === true) {
            this.wasTap = false;
        }
    }

    /**
     * Touch end event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onTouchEnd(e) {
        const target = e.target || e.touches[0].target;
        const hasActiveDropdown = this.dropdown.classList.contains(this.config.classNames.activeState);

        // If a user tapped within our container...
        if (this.wasTap === true && this.containerOuter.contains(target)) {
            // ...and we aren't dealing with a single select box, show dropdown/focus input
            if ((target === this.containerOuter || target === this.containerInner) && this.passedElement.type !== 'select-one') {
                if (this.passedElement.type === 'text') {
                    // If text element, we only want to focus the input (if it isn't already)
                    if (document.activeElement !== this.input) {
                        this.input.focus();
                    }
                } else {
                    if (!hasActiveDropdown) {
                        // If a select box, we want to show the dropdown
                        this.showDropdown(true);
                    }
                }
            }
            // Prevents focus event firing
            e.stopPropagation();
        }

        this.wasTap = true;
    }

    /**
     * Mouse down event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onMouseDown(e) {
        const target = e.target;

        if (this.containerOuter.contains(target) && target !== this.input) {
            const activeItems = this.store.getItemsFilteredByActive();
            const hasShiftKey = e.shiftKey;

            if (target.hasAttribute('data-item')) {
                this._handleItemAction(activeItems, target, hasShiftKey);
            } else if (target.hasAttribute('data-choice')) {
                this._handleChoiceAction(activeItems, target);
            }

            e.preventDefault();
        }
    }

    /**
     * Click event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onClick(e) {
        const target = e.target;
        const hasActiveDropdown = this.dropdown.classList.contains(this.config.classNames.activeState);
        const activeItems = this.store.getItemsFilteredByActive();

        // If target is something that concerns us
        if (this.containerOuter.contains(target)) {
            // Handle button delete
            if (target.hasAttribute('data-button')) {
                this._handleButtonAction(activeItems, target);
            }

            if (!hasActiveDropdown) {
                if (this.passedElement.type === 'text') {
                    if (document.activeElement !== this.input) {
                        this.input.focus();
                    }
                } else {
                    if (this.canSearch) {
                        this.showDropdown(true);
                    } else {
                        this.showDropdown();
                        this.containerOuter.focus();
                    }
                }
            } else if (this.passedElement.type === 'select-one' && target !== this.input && !this.dropdown.contains(target)) {
                this.hideDropdown(true);
            }
        } else {
            const hasHighlightedItems = activeItems.some((item) => item.highlighted === true);

            // De-select any highlighted items
            if (hasHighlightedItems) {
                this.unhighlightAll();
            }

            // Remove focus state
            this.containerOuter.classList.remove(this.config.classNames.focusState);

            // Close all other dropdowns
            if (hasActiveDropdown) {
                this.hideDropdown();
            }
        }
    }

    /**
     * Mouse over (hover) event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onMouseOver(e) {
        // If the dropdown is either the target or one of its children is the target
        if (e.target === this.dropdown || this.dropdown.contains(e.target)) {
            if (e.target.hasAttribute('data-choice')) this._highlightChoice(e.target);
        }
    }

    /**
     * Paste event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onPaste(e) {
        // Disable pasting into the input if option has been set
        if (e.target === this.input && !this.config.paste) {
            e.preventDefault();
        }
    }

    /**
     * Focus event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onFocus(e) {
        const target = e.target;
        // If target is something that concerns us
        if (this.containerOuter.contains(target)) {
            const hasActiveDropdown = this.dropdown.classList.contains(this.config.classNames.activeState);

            switch (this.passedElement.type) {
                case 'text': {
                    if (target === this.input) {
                        this.containerOuter.classList.add(this.config.classNames.focusState);
                    }

                    break;
                }
                case 'select-one': {
                    if (target === this.containerOuter) {
                        // If element is a select box, the focussed element is the container and the dropdown
                        // isn't already open, focus and show dropdown
                        this.containerOuter.classList.add(this.config.classNames.focusState);

                        // Show dropdown if it isn't already showing
                        if (!hasActiveDropdown) {
                            if (!this.focusAndHideDropdown && this.canSearch && document.activeElement !== this.input) {
                                this.showDropdown(true);
                            } else {
                                this.showDropdown();
                            }
                        }

                        this.focusAndHideDropdown = false;
                    }

                    if (target === this.input) {
                        // If element is a select box, the focussed element is the container and the dropdown
                        // isn't already open, focus and show dropdown
                        this.containerOuter.classList.add(this.config.classNames.focusState);

                        // Show dropdown if it isn't already showing
                        if (!hasActiveDropdown) {
                            this.showDropdown();
                        }
                    }

                    break;
                }
                case 'select-multiple': {
                    if (target === this.input) {
                        // If element is a select box, the focussed element is the container and the dropdown
                        // isn't already open, focus and show dropdown
                        this.containerOuter.classList.add(this.config.classNames.focusState);

                        if (!hasActiveDropdown) {
                            this.showDropdown(true);
                        }
                    }

                    break;
                }

                default:
                    break;
            }
        }
    }

    /**
     * Blur event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onBlur(e) {
        const target = e.target;
        // If target is something that concerns us
        if (this.containerOuter.contains(target)) {
            const activeItems = this.store.getItemsFilteredByActive();
            const hasActiveDropdown = this.dropdown.classList.contains(this.config.classNames.activeState);
            const hasHighlightedItems = activeItems.some((item) => item.highlighted === true);

            switch (this.passedElement.type) {
                case 'text': {
                    if (target === this.input) {
                        // Remove the focus state
                        this.containerOuter.classList.remove(this.config.classNames.focusState);
                        // De-select any highlighted items
                        if (hasHighlightedItems) {
                            this.unhighlightAll();
                        }
                        // Hide dropdown if it is showing
                        if (hasActiveDropdown) {
                            this.hideDropdown();
                        }
                    }

                    break;
                }
                case 'select-one': {
                    if (target === this.containerOuter) {
                        this.containerOuter.classList.remove(this.config.classNames.focusState);

                        // Hide dropdown if it is showing
                        if (hasActiveDropdown && !this.canSearch) {
                            this.hideDropdown();
                        }
                    }

                    if (target === this.input) {
                        this.containerOuter.classList.remove(this.config.classNames.focusState);

                        // Hide dropdown if it is showing
                        if (hasActiveDropdown) {
                            this.hideDropdown();
                        }
                    }

                    break;
                }
                case 'select-multiple': {
                    if (target === this.input) {
                        // Remove the focus state
                        this.containerOuter.classList.remove(this.config.classNames.focusState);
                        if (hasActiveDropdown) {
                            this.hideDropdown();
                        }
                        // De-select any highlighted items
                        if (hasHighlightedItems) {
                            this.unhighlightAll();
                        }
                    }

                    break;
                }

                default:
                    break;
            }
        }
    }

    /**
     * Tests value against a regular expression
     * @param  {string} value   Value to test
     * @return {Boolean}        Whether test passed/failed
     * @private
     */
    _regexFilter(value) {
        if (!value) return;
        const regex = this.config.regexFilter;
        const expression = new RegExp(regex.source, 'i');
        return expression.test(value);
    }

    /**
     * Scroll to an option element
     * @param  {HTMLElement} option  Option to scroll to
     * @param  {Number} direction  Whether option is above or below
     * @return
     * @private
     */
    _scrollToChoice(choice, direction) {
        if (!choice) return;

        const dropdownHeight = this.choiceList.offsetHeight;
        const choiceHeight = choice.offsetHeight;

        // Distance from bottom of element to top of parent
        const choicePos = choice.offsetTop + choiceHeight;

        // Scroll position of dropdown
        const containerScrollPos = this.choiceList.scrollTop + dropdownHeight;

        // Difference between the choice and scroll position
        const endPoint = direction > 0 ? ((this.choiceList.scrollTop + choicePos) - containerScrollPos) : choice.offsetTop;

        const animateScroll = () => {
            const strength = 4;
            let continueAnimation = false;
            let easing;
            let distance;

            if (direction > 0) {
                easing = (endPoint - this.choiceList.scrollTop) / strength;
                distance = easing > 1 ? easing : 1;

                this.choiceList.scrollTop = this.choiceList.scrollTop + distance;
                if (this.choiceList.scrollTop < endPoint) {
                    continueAnimation = true;
                }
            } else {
                easing = (this.choiceList.scrollTop - endPoint) / strength;
                distance = easing > 1 ? easing : 1;

                this.choiceList.scrollTop = this.choiceList.scrollTop - distance;
                if (this.choiceList.scrollTop > endPoint) {
                    continueAnimation = true;
                }
            }

            if (continueAnimation) {
                requestAnimationFrame((time) => {
                    animateScroll(time, endPoint, direction);
                });
            }
        };

        requestAnimationFrame((time) => {
            animateScroll(time, endPoint, direction);
        });
    }

    /**
     * Highlight choice
     * @param  {HTMLElement} el Element to highlight
     * @return
     * @private
     */
    _highlightChoice(el) {
        // Highlight first element in dropdown
        const choices = Array.from(this.dropdown.querySelectorAll('[data-choice-selectable]'));

        if (choices && choices.length) {
            const highlightedChoices = Array.from(this.dropdown.querySelectorAll(`.${this.config.classNames.highlightedState}`));

            // Remove any highlighted choices
            highlightedChoices.forEach((choice) => {
                choice.classList.remove(this.config.classNames.highlightedState);
                choice.setAttribute('aria-selected', 'false');
            });

            if (el) {
                // Highlight given option
                el.classList.add(this.config.classNames.highlightedState);
                this.highlightPosition = choices.indexOf(el);
            } else {
                // Highlight choice based on last known highlight location
                let choice;

                if (choices.length > this.highlightPosition) {
                    // If we have an option to highlight
                    choice = choices[this.highlightPosition];
                } else {
                    // Otherwise highlight the option before
                    choice = choices[choices.length - 1];
                }

                if (!choice) choice = choices[0];
                choice.classList.add(this.config.classNames.highlightedState);
                choice.setAttribute('aria-selected', 'true');
            }
        }
    }

    /**
     * Add item to store with correct value
     * @param {String} value Value to add to store
     * @param {String} label Label to add to store
     * @return {Object} Class instance
     * @public
     */
    _addItem(value, label, choiceId = -1) {
        let passedValue = isType('String', value) ? value.trim() : value;
        const items = this.store.getItems();
        const passedLabel = label || passedValue;
        const passedOptionId = parseInt(choiceId, 10) || -1;

        // If a prepended value has been passed, prepend it
        if (this.config.prependValue) {
            passedValue = this.config.prependValue + passedValue.toString();
        }

        // If an appended value has been passed, append it
        if (this.config.appendValue) {
            passedValue += this.config.appendValue.toString();
        }

        // Generate unique id
        const id = items ? items.length + 1 : 1;

        this.store.dispatch(addItem(passedValue, passedLabel, id, passedOptionId));

        if (this.passedElement.type === 'select-one') {
            this.removeActiveItems(id);
        }

        // Run callback if it is a function
        if (this.config.callbackOnAddItem) {
            const callback = this.config.callbackOnAddItem;
            if (isType('Function', callback)) {
                callback(id, passedValue, this.passedElement);
            } else {
                console.error('callbackOnAddItem: Callback is not a function');
            }
        }

        return this;
    }

    /**
     * Remove item from store
     * @param {Object} item Item to remove
     * @param {Function} callback Callback to trigger
     * @return {Object} Class instance
     * @public
     */
    _removeItem(item, callback = this.config.callbackOnRemoveItem) {
        if (!item || !isType('Object', item)) {
            console.error('removeItem: No item object was passed to be removed');
            return;
        }

        const id = item.id;
        const value = item.value;
        const choiceId = item.choiceId;

        this.store.dispatch(removeItem(id, choiceId));

        // Run callback
        if (callback) {
            if (!isType('Function', callback)) {
                console.error('callbackOnRemoveItem: Callback is not a function');
                return;
            }
            callback(id, value, this.passedElement);
        }

        return this;
    }

    /**
     * Add choice to dropdown
     * @param {Boolean} isSelected Whether choice is selected
     * @param {Boolean} isDisabled Whether choice is disabled
     * @param {String} value Value of choice
     * @param {String} Label Label of choice
     * @param {Number} groupId ID of group choice is within. Negative number indicates no group
     * @return
     * @private
     */
    _addChoice(isSelected, isDisabled, value, label, groupId = -1) {
        if (!value) return;

        // Generate unique id
        const choices = this.store.getChoices();
        const choiceLabel = label || value;
        const choiceId = choices ? choices.length + 1 : 1;

        this.store.dispatch(addChoice(value, choiceLabel, choiceId, groupId, isDisabled));

        if (isSelected && !isDisabled) {
            this._addItem(value, choiceLabel, choiceId);
        }
    }

    /**
     * Add group to dropdown
     * @param {Object} group Group to add
     * @param {Number} id Group ID
     * @return
     * @private
     */
    _addGroup(group, id) {
        const groupChoices = isType('Object', group) ? group.choices : Array.from(group.getElementsByTagName('OPTION'));
        const groupId = id;
        const isDisabled = group.disabled ? group.disabled : false;

        if (groupChoices) {
            this.store.dispatch(addGroup(group.label, groupId, true, isDisabled));

            groupChoices.forEach((option) => {
                const isOptDisabled = (option.disabled || (option.parentNode && option.parentNode.disabled)) || false;
                const isOptSelected = option.selected ? option.selected : false;
                let label;

                if (isType('Object', option)) {
                    label = option.label || option.value;
                } else {
                    label = option.innerHTML;
                }

                this._addChoice(isOptSelected, isOptDisabled, option.value, label, groupId);
            });
        } else {
            this.store.dispatch(addGroup(group.label, group.id, false, group.disabled));
        }
    }

    /**
     * Get template from name
     * @param  {String}    template Name of template to get
     * @param  {...}       args     Data to pass to template
     * @return {HTMLElement}        Template
     * @private
     */
    _getTemplate(template, ...args) {
        if (!template) return;
        const templates = this.config.templates;
        return templates[template](...args);
    }

    /**
     * Create HTML element based on type and arguments
     * @return
     * @private
     */
    _createTemplates() {
        const classNames = this.config.classNames;
        const templates = {
            containerOuter: () => {
                return strToEl(`
                    <div class="${classNames.containerOuter}" data-type="${this.passedElement.type}" ${this.passedElement.type === 'select-one' ? 'tabindex="0"' : ''} aria-haspopup="true" aria-expanded="false"></div>
                `);
            },
            containerInner: () => {
                return strToEl(`
                    <div class="${classNames.containerInner}"></div>
                `);
            },
            itemList: () => {
                return strToEl(`
                    <div class="${classNames.list} ${this.passedElement.type === 'select-one' ? classNames.listSingle : classNames.listItems}"></div>
                `);
            },
            placeholder: (value) => {
                return strToEl(`
                    <div class="${classNames.placeholder}">
                        ${value}
                    </div>
                `);
            },
            item: (data) => {
                if (this.config.removeItemButton) {
                    return strToEl(`
                        <div class="${classNames.item} ${data.highlighted ? classNames.highlightedState : ''} ${!data.disabled ? classNames.itemSelectable : ''}" data-item data-id="${data.id}" data-value="${data.value}" ${data.active ? 'aria-selected="true"' : ''} ${data.disabled ? 'aria-disabled="true"' : ''} data-deletable>
                            ${data.label}<button class="${classNames.button}" data-button>Remove item</button>
                        </div>
                    `);
                }
                return strToEl(`
                    <div class="${classNames.item} ${data.highlighted ? classNames.highlightedState : classNames.itemSelectable}"  data-item data-id="${data.id}" data-value="${data.value}" ${data.active ? 'aria-selected="true"' : ''} ${data.disabled ? 'aria-disabled="true"' : ''}>
                        ${data.label}
                    </div>
                `);
            },
            choiceList: () => {
                return strToEl(`
                    <div class="${classNames.list}" dir="ltr" role="listbox" ${this.passedElement.type !== 'select-one' ? 'aria-multiselectable="true"' : ''}></div>
                `);
            },
            choiceGroup: (data) => {
                return strToEl(`
                    <div class="${classNames.group} ${data.disabled ? classNames.itemDisabled : ''}" data-group data-id="${data.id}" data-value="${data.value}" role="group" ${data.disabled ? 'aria-disabled="true"' : ''}>
                        <div class="${classNames.groupHeading}">${data.value}</div>
                    </div>
                `);
            },
            choice: (data) => {
                return strToEl(`
                    <div class="${classNames.item} ${classNames.itemChoice} ${data.disabled ? classNames.itemDisabled : classNames.itemSelectable}" data-choice ${data.disabled ? 'data-choice-disabled aria-disabled="true"' : 'data-choice-selectable'} data-id="${data.id}" data-value="${data.value}" ${data.groupId > 0 ? 'role="treeitem"' : 'role="option"'}>
                        ${data.label}
                    </div>
                `);
            },
            input: () => {
                return strToEl(`
                    <input type="text" class="${classNames.input} ${classNames.inputCloned}" autocomplete="off" autocapitalize="off" spellcheck="false" role="textbox" aria-autocomplete="list">
                `);
            },
            dropdown: () => {
                return strToEl(`
                    <div class="${classNames.list} ${classNames.listDropdown}" aria-expanded="false"></div>
                `);
            },
            notice: (label) => {
                return strToEl(`
                    <div class="${classNames.item} ${classNames.itemChoice}">${label}</div>
                `);
            },
            option: (data) => {
                return strToEl(`
                    <option value="${data.value}" selected>${data.label}</option>
                `);
            },
        };

        this.config.templates = templates;
    }

    /**
     * Create DOM structure around passed select element
     * @return
     * @private
     */
    _createInput() {
        const containerOuter = this._getTemplate('containerOuter');
        const containerInner = this._getTemplate('containerInner');
        const itemList = this._getTemplate('itemList');
        const choiceList = this._getTemplate('choiceList');
        const input = this._getTemplate('input');
        const dropdown = this._getTemplate('dropdown');

        this.containerOuter = containerOuter;
        this.containerInner = containerInner;
        this.input = input;
        this.choiceList = choiceList;
        this.itemList = itemList;
        this.dropdown = dropdown;

        // Hide passed input
        this.passedElement.classList.add(this.config.classNames.input, this.config.classNames.hiddenState);
        this.passedElement.tabIndex = '-1';
        this.passedElement.setAttribute('style', 'display:none;');
        this.passedElement.setAttribute('aria-hidden', 'true');
        this.passedElement.setAttribute('data-choice', 'active');

        // Wrap input in container preserving DOM ordering
        wrap(this.passedElement, containerInner);

        // Wrapper inner container with outer container
        wrap(containerInner, containerOuter);

        // If placeholder has been enabled and we have a value
        const placeholder = this.config.placeholder ? this.config.placeholderValue || this.passedElement.getAttribute('placeholder') : false;
        if (placeholder) {
            input.placeholder = placeholder;
            if (this.passedElement.type !== 'select-one') {
                input.style.width = getWidthOfInput(input);
            }
        }

        if (!this.config.addItems) this.disable();

        containerOuter.appendChild(containerInner);
        containerOuter.appendChild(dropdown);
        containerInner.appendChild(itemList);

        if (this.passedElement.type !== 'text') {
            dropdown.appendChild(choiceList);
        }

        if (this.passedElement.type === 'select-multiple' || this.passedElement.type === 'text') {
            containerInner.appendChild(input);
        } else if (this.canSearch) {
            dropdown.insertBefore(input, dropdown.firstChild);
        }

        if (this.passedElement.type === 'select-multiple' || this.passedElement.type === 'select-one') {
            const passedGroups = Array.from(this.passedElement.getElementsByTagName('OPTGROUP'));

            this.highlightPosition = 0;
            this.isSearching = false;

            if (passedGroups && passedGroups.length) {
                passedGroups.forEach((group, index) => {
                    this._addGroup(group, index);
                });
            } else {
                const passedOptions = Array.from(this.passedElement.options);
                const allChoices = [];

                // Create array of options from option elements
                passedOptions.forEach((o) => {
                    allChoices.push({
                        value: o.value,
                        label: o.innerHTML,
                        selected: o.selected,
                        disabled: o.disabled || o.parentNode.disabled,
                    });
                });

                // Join choices with preset choices and add them
                allChoices
                    .concat(this.presetChoices)
                    .forEach((o, index) => {
                        if (index === 0 && this.passedElement.type === 'select-one') {
                            this._addChoice(true, o.disabled ? o.disabled : false, o.value, o.label);
                        } else {
                            this._addChoice(o.selected ? o.selected : false, o.disabled ? o.disabled : false, o.value, o.label);
                        }
                    });
            }
        } else if (this.passedElement.type === 'text') {
            // Add any preset values seperated by delimiter
            this.presetItems.forEach((item) => {
                if (isType('Object', item)) {
                    if (!item.value) return;
                    this._addItem(item.value, item.label, item.id);
                } else if (isType('String', item)) {
                    this._addItem(item);
                }
            });
        }
    }

    /**
     * Render group choices into a DOM fragment and append to choice list
     * @param  {Array} groups    Groups to add to list
     * @param  {Array} choices   Choices to add to groups
     * @param  {DocumentFragment} fragment Fragment to add groups and options to (optional)
     * @return {DocumentFragment} Populated options fragment
     * @private
     */
    renderGroups(groups, choices, fragment) {
        const groupFragment = fragment || document.createDocumentFragment();
        const filter = this.config.sortFilter;

        groups
            .sort(filter)
            .forEach((group) => {
                // Grab options that are children of this group
                const groupChoices = choices.filter((choice) => {
                    if (this.passedElement.type === 'select-one') {
                        return choice.groupId === group.id;
                    }

                    return choice.groupId === group.id && !choice.selected;
                });

                if (groupChoices.length >= 1) {
                    const dropdownGroup = this._getTemplate('choiceGroup', group);
                    groupFragment.appendChild(dropdownGroup);

                    this.renderChoices(groupChoices, groupFragment);
                }
            });

        return groupFragment;
    }

    /**
     * Render choices into a DOM fragment and append to choice list
     * @param  {Array} choices    Choices to add to list
     * @param  {DocumentFragment} fragment Fragment to add choices to (optional)
     * @return {DocumentFragment} Populated choices fragment
     * @private
     */
    renderChoices(choices, fragment) {
        // Create a fragment to store our list items (so we don't have to update the DOM for each item)
        const choicesFragment = fragment || document.createDocumentFragment();
        const filter = this.isSearching ? sortByScore : this.config.sortFilter;

        choices
            .sort(filter)
            .forEach((choice) => {
                const dropdownItem = this._getTemplate('choice', choice);
                if (this.passedElement.type === 'select-one') {
                    choicesFragment.appendChild(dropdownItem);
                } else if (!choice.selected) {
                    choicesFragment.appendChild(dropdownItem);
                }
            });

        return choicesFragment;
    }

    /**
     * Render items into a DOM fragment and append to items list
     * @param  {Array} items    Items to add to list
     * @param  {DocumentFragment} fragment Fragrment to add items to (optional)
     * @return
     * @private
     */
    renderItems(items, fragment) {
        // Create fragment to add elements to
        const itemListFragment = fragment || document.createDocumentFragment();
        // Simplify store data to just values
        const itemsFiltered = this.store.getItemsReducedToValues(items);

        if (this.passedElement.type === 'text') {
            // Assign hidden input array of values
            this.passedElement.setAttribute('value', itemsFiltered.join(this.config.delimiter));
        } else {
            const selectedOptionsFragment = document.createDocumentFragment();

            // Add each list item to list
            items.forEach((item) => {
                // Create a standard select option
                const option = this._getTemplate('option', item);

                // Append it to fragment
                selectedOptionsFragment.appendChild(option);
            });

            // Update selected choices
            this.passedElement.innerHTML = '';
            this.passedElement.appendChild(selectedOptionsFragment);
        }

        // Add each list item to list
        items.forEach((item) => {
            // Create new list element
            const listItem = this._getTemplate('item', item);
            // Append it to list
            itemListFragment.appendChild(listItem);
        });

        return itemListFragment;
    }

    /**
     * Render DOM with values
     * @return
     * @private
     */
    render() {
        this.currentState = this.store.getState();

        // Only render if our state has actually changed
        if (this.currentState !== this.prevState) {
            // Choices
            if (this.currentState.choices !== this.prevState.choices || this.currentState.groups !== this.prevState.groups) {
                if (this.passedElement.type === 'select-multiple' || this.passedElement.type === 'select-one') {
                    // Get active groups/choices
                    const activeGroups = this.store.getGroupsFilteredByActive();
                    const activeChoices = this.store.getChoicesFilteredByActive();

                    let choiceListFragment = document.createDocumentFragment();

                    // Clear choices
                    this.choiceList.innerHTML = '';
                    // Scroll back to top of choices list
                    this.choiceList.scrollTop = 0;

                    // If we have grouped options
                    if (activeGroups.length >= 1 && this.isSearching !== true) {
                        choiceListFragment = this.renderGroups(activeGroups, activeChoices, choiceListFragment);
                    } else if (activeChoices.length >= 1) {
                        choiceListFragment = this.renderChoices(activeChoices, choiceListFragment);
                    }

                    if (choiceListFragment.childNodes && choiceListFragment.childNodes.length > 0) {
                        // If we actually have anything to add to our dropdown
                        // append it and highlight the first choice
                        this.choiceList.appendChild(choiceListFragment);
                        this._highlightChoice();
                    } else {
                        // Otherwise show a notice
                        const dropdownItem = this.isSearching ? this._getTemplate('notice', this.config.noResultsText) : this._getTemplate('notice', this.config.noChoicesText);
                        this.choiceList.appendChild(dropdownItem);
                    }
                }
            }

            // Items
            if (this.currentState.items !== this.prevState.items) {
                const activeItems = this.store.getItemsFilteredByActive();
                if (activeItems) {
                    // Create a fragment to store our list items
                    // (so we don't have to update the DOM for each item)
                    const itemListFragment = this.renderItems(activeItems);

                    // Clear list
                    this.itemList.innerHTML = '';

                    // If we have items to add
                    if (itemListFragment.childNodes) {
                        // Update list
                        this.itemList.appendChild(itemListFragment);
                    }
                }
            }

            this.prevState = this.currentState;
        }
    }
}

window.Choices = module.exports = Choices;