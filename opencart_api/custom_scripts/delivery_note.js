
cur_frm.cscript['Make Packing Slip'] = function() {
	frappe.model.open_mapped_doc({
		method: "opencart_api.delivery_note.make_packing_slip",
		frm: cur_frm
	})

}

var old_get_indicator = frappe.get_indicator;
frappe.get_indicator = function(doc, doctype) {
	if(doc.__unsaved) {
		return [__("Not Saved"), "orange"];
	}
	if(!doctype) doctype = doc.doctype;
    if(doctype == "Delivery Note" && doc.status == "Ready to ship") {
        return [__("Ready to ship"), "blue"]
    }
    else {
    	return old_get_indicator(doc, doctype);
    }
}