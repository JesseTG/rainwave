// REQUIRED EXTERNAL DEFINITIONS FOR USING THIS OBJECT FACTORY:
//	draw_entry(item);				// return a new element (will be using display: block, you SHOULD make a div)
//  update_item_element(item);		// return nothing, just update text/etc in the element you created above
//  open_id(id);					// open what the user has selected

// OPTIONAL FUNCTIONS you can overwrite:
//	after_update(json, data, sorted_data);
//  sort_function(a, b);			// normal Javascript sort method - return -1, 0, or 1 (default just uses 'id')

var SearchList = function(root_el, sort_key, search_key) {
	"use strict";

	var template = RWTemplates.searchlist();
	root_el.appendChild(template._root);

	var self = {};
	self.sort_key = sort_key;
	self.search_key = search_key || "id";
	self.auto_trim = false;

	var stretcher = document.createElement("div");
	stretcher.className = "stretcher";
	template.list.appendChild(stretcher);

	self.el = document.createElement("div");
	self.el.className = "list_contents";
	template.list.appendChild(self.el);

	var search_box = template.search_box;
	var scroll = Scrollbar.create(template.list, false, true);

	var data = {};
	self.data = data;			// keys() are the object IDs (e.g. data[album.id])
	self.loaded = false;

	var visible = [];			// list of IDs sorted by the sort_function (visible on screen)
	var hidden = [];			// list of IDs unsorted - currently hidden from view during a search

	var hotkey_mode_on = false;
	var hotkey_timeout;
	var search_string = "";
	var current_key_nav_id = false;
	var current_open_id = false;
	var num_items_to_display;
	var original_scroll_top;
	var original_key_nav;
	var ignore_original_scroll_top;
	var scroll_to_on_load;

	var current_scroll_index = false;
	var current_height;


	// LIST MANAGEMENT ***********************************************

	self.update = function(json) {
		var i;
		if (self.auto_trim) {
			for (i in data) {
				data[i]._delete = true;
			}
		}
		for (i in json) {
			self.update_item(json[i]);
		}

		if (self.update_cool) {
			for (i in data) {
				self.update_cool(data[i]);
			}
		}

		if (search_string.length === 0) {
			self.unhide();
			current_scroll_index = false;
			scroll.scroll_top = 0;
			self.recalculate();
			self.reposition();
		}

		if (scroll_to_on_load) {
			self.scroll_to_id(scroll_to_on_load);
			scroll_to_on_load = false;
		}

		self.loaded = true;
	};

	self.refresh_all_items = function() {
		for (var i in data) {
			self.update_item_element(data[i]);
		}
	};

	self.update_item = function(json) {
		var i;
		json._delete = false;
		if (json.id in data) {
			for (i in json) {
				self.data[json.id][i] = json[i];
			}
			self.update_item_element(self.data[json.id]);
		}
		else {
			self.draw_entry(json);
			json._searchname = json[search_key];
			json._el._id = json.id;
			json._lower_case_sort_keyed = json[sort_key].toLowerCase();
			data[json.id] = json;
		}
		self.queue_reinsert(json.id);
	};

	self.update_cool = null;

	self.queue_reinsert = function(id) {
		var io = visible.indexOf(id);
		if (io >= 0) {
			visible.splice(io, 1);
		}
		if (hidden.indexOf(id) == -1) {
			hidden.push(id);
		}
	};

	var hotkey_mode_enable = function() {
		hotkey_mode_on = true;
		self.do_searchbar_style();
	};

	var hotkey_mode_disable = function() {
		hotkey_mode_on = false;
		self.do_searchbar_style();
	};

	self.hotkey_mode_disable = hotkey_mode_disable;

	var hotkey_mode_handle = function(character) {
		// try {
		// 	if ((parseInt(character) >= 1) && (parseInt(character) <= 5)) {
		// 		Schedule.rate_current_song(parseInt(character));
		// 	}
		// 	else if (character == "q") Schedule.rate_current_song(1.5);
		// 	else if (character == "w") Schedule.rate_current_song(2.5);
		// 	else if (character == "e") Schedule.rate_current_song(3.5);
		// 	else if (character == "r") Schedule.rate_current_song(4.5);

		// 	else if (character == "a") Schedule.vote(0, 0);
		// 	else if (character == "s") Schedule.vote(0, 1);
		// 	else if (character == "d") Schedule.vote(0, 2);
		// 	else if (character == "z") Schedule.vote(1, 0);
		// 	else if (character == "y") Schedule.vote(1, 0); 		// quertz layout
		// 	else if (character == "x") Schedule.vote(1, 1);
		// 	else if (character == "c") Schedule.vote(1, 2);
		// 	else {
		// 		hotkey_mode_error("invalid_hotkey");
		// 		return true;
		// 	}
		// 	hotkey_mode_disable();
		// 	return true;
		// }
		// catch (err) {
		// 	if ("is_rw" in err) {
		// 		hotkey_mode_error(err.tl_key);
		// 		return true;
		// 	}
		// 	else {
		// 		throw(err);
		// 	}
		// }
	};

	var hotkey_mode_error = function(tl_key) {
		// hotkey_mode_disable();
		// $add_class(self.search_box_input.parentNode.parentNode, "hotkey_mode_error");
		// search_box.setAttribute("placeholder",  $l(tl_key));
		// hotkey_timeout = setTimeout(function() {
		// 	$remove_class(self.search_box_input.parentNode.parentNode, "hotkey_mode_error");
		// 	search_box.setAttribute("placeholder", $l("filter"));
		// 	hotkey_timeout = null;
		// 	}, 6000);
	};

	self.unhide = function(to_reshow) {
		to_reshow = to_reshow || hidden;
		if (visible.length === 0) {
			to_reshow.sort(self.sort_function);
			visible = to_reshow;
		}
		else {
			visible = visible.concat(to_reshow);
			visible.sort(self.sort_function);
		}
		if (to_reshow == hidden) hidden = [];
	};

	self.recalculate = function() {
		var full_height = Sizing.list_item_height * visible.length;
		if (full_height != current_height) {
			stretcher.style.height = full_height + "px";
			scroll.set_height(full_height);
			current_height = full_height;
		}
		num_items_to_display = Math.ceil(scroll.offset_height / Sizing.list_item_height) + 1;
	};

	self.sort_function = function(a, b) {
		if (data[a]._lower_case_sort_keyed < data[b]._lower_case_sort_keyed) return -1;
		else if (data[a]._lower_case_sort_keyed > data[b]._lower_case_sort_keyed) return 1;
		return 0;
	};

	self.open_element = function(e) {
		e.stopPropagation();
		var check_el = e.target;
		while (check_el && !("_id" in check_el) && (check_el != self.el) && (check_el != document.body)) {
			check_el = check_el.parentNode;
		}
		if (check_el && "_id" in check_el) {
			self.open_id(check_el._id);
		}
	};
	self.el.addEventListener("click", self.open_element);

	// SEARCHING ****************************

	self.remove_key_nav_highlight = function() {
		if (current_key_nav_id) {
			data[current_key_nav_id]._el.classList.remove("hover");
			current_key_nav_id = null;
		}
	};

	self.key_nav_highlight = function(id, no_scroll) {
		original_key_nav = false;
		self.remove_key_nav_highlight();
		current_key_nav_id = id;
		data[current_key_nav_id]._el.classList.add("hover");
		if (!no_scroll) self.scroll_to(data[id]);
	};

	self.key_nav_first_item = function() {
		self.key_nav_highlight(visible[0]);
	};

	self.key_nav_last_item = function() {
		self.key_nav_highlight(visible[visible.length - 1]);
	};

	var key_nav_arrow_action = function(jump) {
		backspace_scroll_top = null;
		if (!current_key_nav_id) {
			self.key_nav_first_item();
			return;
		}
		var current_idx = visible.indexOf(current_key_nav_id);
		if (!current_idx && (current_idx !== 0)) {
			self.key_nav_first_item();
			return;
		}
		var new_index = Math.max(0, Math.min(current_idx + jump, visible.length - 1));
		self.key_nav_highlight(visible[new_index]);
		return true;
	};

	self.key_nav_down = function() {
		return key_nav_arrow_action(1);
	};

	self.key_nav_up = function() {
		return key_nav_arrow_action(-1);
	};

	self.key_nav_page_down = function() {
		return key_nav_arrow_action(15);
	};

	self.key_nav_page_up = function() {
		return key_nav_arrow_action(-15);
	};

	self.key_nav_enter = function() {
		if (current_key_nav_id) {
			self.open_element({ "target": data[current_key_nav_id]._el, "enter_key": true });
			return true;
		}
		return false;
	};

	self.key_nav_escape = function() {
		if (hotkey_mode_on) hotkey_mode_disable();
		if (search_string.length > 0) {
			self.clear_search();
		}
		return true;
	};

	var backspace_scroll_top;

	self.key_nav_backspace = function() {
		if (search_string.length == 1) {
			self.clear_search();
			return true;
		}
		else if (search_string.length > 1) {
			search_string = search_string.substring(0, search_string.length - 1);

			var use_search_string = Formatting.make_searchable_string(search_string);
			var revisible = [];
			for (var i = hidden.length - 1; i >= 0; i--) {
				if (data[hidden[i]]._searchname.indexOf(use_search_string) != -1) {
					revisible.push(hidden.splice(i, 1)[0]);
				}
			}
			self.unhide(revisible);
			self.do_searchbar_style();

			current_scroll_index = false;
			self.recalculate();
			if (backspace_scroll_top && (revisible.length + visible.length > num_items_to_display)) {
				scroll.scroll_to(backspace_scroll_top);
				backspace_scroll_top = null;
			}
			self.reposition();
			return true;
		}
		return false;
	};

	var do_search = function(new_string) {
		var first_time = search_string.length === 0 ? true : false;
		if (first_time) {
			original_key_nav = current_key_nav_id;
			self.remove_key_nav_highlight();
		}
		search_string = new_string;
		var use_search_string = Formatting.make_searchable_string(search_string);
		var new_visible = [];
		for (var i = 0; i < visible.length; i++) {
			if (data[visible[i]]._searchname.indexOf(use_search_string) == -1) {
				hidden.push(visible[i]);
			}
			else {
				new_visible.push(visible[i]);
			}
		}
		visible = new_visible;
		if (!visible.indexOf(current_key_nav_id)) {
			self.remove_key_nav_highlight();
		}
		current_scroll_index = false;
		if (first_time) {
			original_scroll_top = scroll.scroll_top;
			self.recalculate();
			scroll.scroll_to(0);
		}
		else if (visible.length <= num_items_to_display) {
			backspace_scroll_top = scroll.scroll_top;
			self.recalculate();
			scroll.scroll_to(0);
		}
		else if (visible.length <= current_scroll_index) {
			backspace_scroll_top = scroll.scroll_top;
			self.recalculate();
			scroll.scroll_to((visible.length - num_items_to_display) * Sizing.list_item_height);
		}
		else {
			self.recalculate();
		}
		self.reposition();
		self.do_searchbar_style();
	};

	self.key_nav_add_character = function(character) {
		if (hotkey_mode_on) {
			if (hotkey_mode_handle(character)) {
				return true;
			}
		}
		else if ((search_string.length === 0) && (character === " ")) {
			hotkey_mode_enable();
			return true;
		}
		do_search(search_string + character);
		return true;
	};

	self.clear_search = function() {
		backspace_scroll_top = null;
		search_string = "";
		search_box.value = "";
		self.do_searchbar_style();
		if (hidden.length === 0) return;
		self.unhide();

		current_scroll_index = false;
		self.recalculate();
		if (original_key_nav) {
			self.key_nav_highlight(original_key_nav, true);
			original_key_nav = false;
		}
		if (original_scroll_top && !ignore_original_scroll_top) {
		 	scroll.scroll_to(original_scroll_top);
		 	original_scroll_top = false;
		}
		else {
			self.scroll_to_default();
		}
		ignore_original_scroll_top = false;
	};

	search_box.addEventListener("input", function() {
		if (!search_box.value.length) {
			self.clear_search();
		}
		else {
			if (search_box.value.length < search_string.length) {
				self.unhide();
			}
			do_search(search_box.value);
		}
	});

	self.do_searchbar_style = function() {
		if (hotkey_timeout) clearTimeout(hotkey_timeout);
		if (hotkey_mode_on) {
			search_box.classList.add("active");
			search_box.value = "";
			search_box.setAttribute("placeholder", $l("hotkey_mode"));
			return;
		}
		else {
			search_box.classList.remove("active");
		}

		if (search_string && (visible.length === 0)) {
			search_box.classList.add("error");
		}
		else {
			search_box.classList.remove("error");
		}

		if (search_string.length > 0) {
			search_box.value = search_string;
			search_box.classList.add("active");
		}
		else {
			search_box.classList.remove("active");
		}
	};

	// SCROLL **************************


	self.scroll_to_id = function(id) {
		if (id in data) self.scroll_to(data[id]);
		else scroll_to_on_load = id;
	};

	self.scroll_to = function(data_item) {
		if (data_item) {
			var new_index = visible.indexOf(data_item.id);
			if ((new_index > (current_scroll_index + 7)) && (new_index < (current_scroll_index + num_items_to_display - 7))) {
				if (!current_scroll_index) {
					self.redraw_current_position();
				}
			}
			// position at the lower edge
			else if (new_index >= (current_scroll_index + num_items_to_display - 8)) {
				scroll.scroll_to(Math.min(scroll.scroll_top_max, (new_index - num_items_to_display + 8) * Sizing.list_item_height));
			}
			// position at the higher edge
			else {
				scroll.scroll_to(Math.max(0, (new_index - 7) * Sizing.list_item_height));
			}
		}
	};

	self.scroll_to_default = function() {
		if (current_key_nav_id && visible.indexOf(current_key_nav_id)) {
			self.scroll_to(data[current_key_nav_id]);
		}
		else if (current_open_id && visible.indexOf(current_open_id)) {
			current_key_nav_id = current_open_id;
			self.scroll_to(data[current_open_id]);
		}
		else {
			self.reposition();
		}
	};

	self.redraw_current_position = function() {
		current_scroll_index = false;
		self.reposition();
	};

	self.reposition = function() {
		if (num_items_to_display === undefined) return;
		var new_index = Math.floor(scroll.scroll_top / Sizing.list_item_height);
		new_index = Math.max(0, Math.min(new_index, visible.length - num_items_to_display));

		var new_margin = (scroll.scroll_top - (Sizing.list_item_height * new_index));
		new_margin = new_margin ? -new_margin : 0;
		self.el.style.transform = "translateY(" + (scroll.scroll_top - new_margin) + "px)";

		if (current_scroll_index === new_index) return;
		if ((visible.length === 0) && (hidden.length === 0)) return;

		if (current_scroll_index) {
			if (new_index < current_scroll_index - num_items_to_display) current_scroll_index = false;
			else if (new_index > current_scroll_index + (num_items_to_display * 2)) current_scroll_index = false;
		}

		var i;
		// full reset
		if (current_scroll_index === false) {
			while (self.el.firstChild) {
	    		self.el.removeChild(self.el.lastChild);
			}
			for (i = new_index; (i < (new_index + num_items_to_display)) && (i < visible.length); i++) {
				self.el.appendChild(data[visible[i]]._el);
			}
		}
		// scrolling up
		else if (new_index < current_scroll_index) {
			for (i = current_scroll_index; i >= new_index; i--) {
				self.el.insertBefore(data[visible[i]]._el, self.el.firstChild);
			}
			while (self.el.childNodes.length > num_items_to_display) {
				self.el.removeChild(self.el.lastChild);
			}
		}
		// scrolling down (or starting fresh)
		else if (new_index > current_scroll_index) {
			for (i = (current_scroll_index + num_items_to_display); ((i < (new_index + num_items_to_display)) && (i < visible.length)) ; i++) {
				self.el.appendChild(data[visible[i]]._el);
			}
			while (self.el.childNodes.length > Math.min(visible.length - new_index, num_items_to_display)) {
				self.el.removeChild(self.el.firstChild);
			}
		}
		current_scroll_index = new_index;
	};

	// NAV *****************************

	self.set_new_open = function(id) {
		if (current_open_id) {
			data[current_open_id]._el.classList.remove("open");
			current_open_id = null;
		}
		if (!(id in data)) return;
		data[id]._el.classList.add("open");
		current_open_id = id;
		self.key_nav_highlight(id);
		if (search_string.length > 0) {
			ignore_original_scroll_top = true;
		}
	};

	Sizing.add_resize_callback(function() {
		scroll.offset_height = Sizing.sizeable_area_height - 84;
		template.list.style.height = scroll.offset_height + "px";
		if (num_items_to_display === undefined) return;
		current_scroll_index = false;
		self.recalculate();
		self.reposition();
	});

	scroll.set_hook(self.reposition);

	return self;
};