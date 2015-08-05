cur_frm.cscript.custom_refresh = function(doc, dt, dn) {
	if(doc.__islocal) {
		delivery_date = frappe.datetime.add_days(frappe.datetime.nowdate(), 7);
		this.frm.set_value("delivery_date", delivery_date);
	}
       
	if(doc.oc_site) {
		frappe.call({
			method: "opencart_api.oc_site.get_order_status_name_list",
			args: {
				"site_name": doc.oc_site,
			},
			callback: function(r) {
				if(!r.exc) {
					set_field_options("oc_status", [""].concat(r.message).join("\n"));
				}
			}
		});
	}
}

cur_frm.cscript.oc_is_shipping_included_in_total = function() {
	var me = this;
    me.shipping_rule();
}

cur_frm.cscript.shipping_rule = function() {
		var me = this;
		var initial_taxes_length = me.frm.doc.taxes.length;
		if(this.frm.doc.shipping_rule) {
			return this.frm.call({
				doc: this.frm.doc,
				method: "apply_shipping_rule",
				callback: function(r) {
					if(!r.exc) {
						if(me.frm.doc.taxes.length - initial_taxes_length == 1) {
                            me.frm.doc.taxes[me.frm.doc.taxes.length - 1].oc_is_shipping_entry = 1;
                            me.frm.refresh_fields();
						}
                        if(me.frm.doc.taxes.length == 2) {
                        	// detect tax_entry and shipping_entry
	                        var tax_entry = undefined;
	                        var shipping_entry = undefined;
							$.each(me.frm.doc.taxes || [], function(i, entry) {
	                            if(entry.oc_is_shipping_entry == 1) {
	                            	shipping_entry = entry;
	                            }
	                            else {
	                            	tax_entry = entry;
	                            }
							});
                            // exchange tax_entry and shipping_entry
                            if (tax_entry && shipping_entry) {
		                        if(me.frm.doc.oc_is_shipping_included_in_total) {
			                        tax_entry.idx = 2;
			                        tax_entry.charge_type = "On Previous Row Total";
				                    tax_entry.row_id = 1;

			                        shipping_entry.idx = 1;
			                    }
			                    else {
			                        shipping_entry.idx = 2;

			                        tax_entry.idx = 1;
			                        tax_entry.charge_type = "Actual";
				                    tax_entry.row_id = "";
			                    }
			                    me.frm.refresh_fields();
		                    }
		                }
	                    me.calculate_taxes_and_totals();
					}
				}
			})
		}
}

cur_frm.cscript.customer = function() {
    var me = this;
    erpnext.utils.get_party_details(this.frm, null, null, function(){me.apply_pricing_rule()});

    // custom code
	// updating taxes and charges
    frappe.call({
    	freeze: true,
		method: "opencart_api.orders.resolve_taxes_and_charges",
		args: {
			"customer": me.frm.doc.customer,
			"company": me.frm.doc.company
		},
		callback: function(r) {
			if(!r.exc) {
				if(r.message) {
				    me.frm.set_value("taxes_and_charges", r.message);
				    me.calculate_taxes_and_totals();

					// updating shipping rule
				    frappe.call({
						method: "opencart_api.orders.resolve_shipping_rule",
						args: {
							"customer": me.frm.doc.customer,
						},
						callback: function(r) {
							if(!r.exc) {
								if(r.message) {
								    me.frm.set_value("shipping_rule", r.message);
								}
							}
						}
					});
				}
			}
		}
	});



	// updating sales order's default warehouse
    frappe.call({
		method: "opencart_api.orders.resolve_customer_warehouse",
		args: {
			"customer": me.frm.doc.customer,
		},
		callback: function(r) {
			if(!r.exc) {
				if(r.message) {
				    me.frm.set_value("warehouse", r.message);
				}
			}
		}
	});

    // updating Sales Order company
    frappe.model.with_doc("Customer", me.frm.doc.customer, function(r) {
	    var doc_customer = frappe.model.get_doc("Customer", me.frm.doc.customer);
        if(doc_customer.oc_site && doc_customer.oc_customer_id) {
            frappe.model.with_doc("Opencart Site", doc_customer.oc_site, function(r) {
                var doc_oc_site = frappe.model.get_doc("Opencart Site", doc_customer.oc_site);
                me.frm.set_value("company", doc_oc_site.company);
            });
        }
	});
}

cur_frm.cscript.item_code = function(doc, cdt, cdn) {
	var me = this;
	var item = frappe.get_doc(cdt, cdn);

	if(item.item_code || item.barcode || item.serial_no) {
		if(!this.validate_company_and_party()) {
			cur_frm.fields_dict["items"].grid.grid_rows[item.idx - 1].remove();
		} else {
			return this.frm.call({
				method: "erpnext.stock.get_item_details.get_item_details",
				child: item,
				args: {
					args: {
						item_code: item.item_code,
						barcode: item.barcode,
						serial_no: item.serial_no,
						warehouse: me.frm.doc.warehouse || item.warehouse,
						parenttype: me.frm.doc.doctype,
						parent: me.frm.doc.name,
						customer: me.frm.doc.customer,
						supplier: me.frm.doc.supplier,
						currency: me.frm.doc.currency,
						conversion_rate: me.frm.doc.conversion_rate,
						price_list: me.frm.doc.selling_price_list ||
							 me.frm.doc.buying_price_list,
						price_list_currency: me.frm.doc.price_list_currency,
						plc_conversion_rate: me.frm.doc.plc_conversion_rate,
						company: me.frm.doc.company,
						order_type: me.frm.doc.order_type,
						is_pos: cint(me.frm.doc.is_pos),
						is_subcontracted: me.frm.doc.is_subcontracted,
						transaction_date: me.frm.doc.transaction_date || me.frm.doc.posting_date,
						ignore_pricing_rule: me.frm.doc.ignore_pricing_rule,
						doctype: item.doctype,
						name: item.name,
						project_name: item.project_name || me.frm.doc.project_name,
						qty: item.qty
					}
				},

				callback: function(r) {
					if(!r.exc) {
						me.frm.script_manager.trigger("price_list_rate", cdt, cdn);
					}
				}
			});
		}
	}
}


cur_frm.cscript.make_delivery_note = function() {
	frappe.model.open_mapped_doc({
		method: "opencart_api.sales_order.make_delivery_note",
		frm: cur_frm
	})
}

cur_frm.cscript.make_sales_invoice = function() {
	frappe.model.open_mapped_doc({
		method: "opencart_api.sales_order.make_sales_invoice",
		frm: cur_frm
	})
}


// cur_frm.cscript.validate = function(doc) {

// }

// cur_frm.cscript.refresh = function(doc, cdt, cdn) {


    // cur_frm.set_df_property("oc_status", "options", "123\n345\n678");

	// if(doc.abbr && !doc.__islocal) {
	// 	cur_frm.set_df_property("abbr", "read_only", 1);
	// }

	// if(!doc.__islocal) {
	// 	cur_frm.toggle_enable("default_currency", (cur_frm.doc.__onload &&
	// 		!cur_frm.doc.__onload.transactions_exist));
	// }

	// erpnext.company.set_chart_of_accounts_options(doc);




	// var dialog = new frappe.ui.Dialog({
	// 	title: "Replace Abbr",
	// 	fields: [
	// 		{"fieldtype": "Data", "label": "New Abbreviation", "fieldname": "new_abbr",
	// 			"reqd": 1 },
	// 		{"fieldtype": "Button", "label": "Update", "fieldname": "update"},
	// 	]
	// });

	// dialog.fields_dict.update.$input.click(function() {
	// 	args = dialog.get_values();
	// 	if(!args) return;
	// 	return frappe.call({
	// 		method: "erpnext.setup.doctype.company.company.replace_abbr",
	// 		args: {
	// 			"company": cur_frm.doc.name,
	// 			"old": cur_frm.doc.abbr,
	// 			"new": args.new_abbr
	// 		},
	// 		callback: function(r) {
	// 			if(r.exc) {
	// 				msgprint(__("There were errors."));
	// 				return;
	// 			} else {
	// 				cur_frm.set_value("abbr", args.new_abbr);
	// 			}
	// 			dialog.hide();
	// 			cur_frm.refresh();
	// 		},
	// 		btn: this
	// 	})
	// });
// 	dialog.show();
// }