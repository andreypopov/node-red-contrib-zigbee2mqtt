function WB_getItemList(nodeItem, selectedItemElementName, options = {}) {

    options = $.extend({
        filterType:'',
        disableReadonly:false,
        refresh:false,
        allowEmpty:false
    }, options);

    function WB_updateItemList(controller, selectedItemElement, itemName, refresh = false) {
        // Remove all previous and/or static (if any) elements from 'select' input element
        selectedItemElement.children().remove();


        if (controller) {
            selectedItemElement.multipleSelect('disable');

            $.getJSON('zigbee2mqtt/getChannels', {
                controllerID: controller.id,
                forceRefresh: refresh
            })
                .done(function (data, textStatus, jqXHR) {
                    try {

                        if (options.allowEmpty) {
                            selectedItemElement.html('<option value="">--Select channel</option>');
                        }

                        var optgroup = '';
                        var disabled = '';
                        var nameSuffix = '';
                        // var selected = false;
                        var groupHtml = '';
                        $.each(data, function(index, value) {
                            disabled = '';
                            nameSuffix = '';


                            // selected = typeof(itemName) == 'string' && value.topic == itemName;


                            //readonly
                            if (typeof value.meta !== 'undefined'
                                && typeof value.meta.type !== 'undefined'
                                && options.disableReadonly
                                && parseInt(value.meta.readonly) == 1
                            ) {
                                disabled = 'disabled="disabled"';
                                nameSuffix = 'readonly';
                                return true;
                            }

                            //filter by type
                            if (typeof value.meta !== 'undefined'
                                && typeof value.meta.type !== 'undefined'
                                && options.filterType
                                && value.meta.type != options.filterType) {
                                disabled = 'disabled="disabled"';
                                nameSuffix = value.meta.type;
                                return true;
                            }

                            if (optgroup != value.device_name) {
                                groupHtml = $('<optgroup/>', { label: value.device_friendly_name});
                                groupHtml.appendTo(selectedItemElement);
                                optgroup = value.device_name;
                            }

                            $('<option '+disabled+' value="' + value.topic +'">' +value.device_name +'/'+ value.control_name + (nameSuffix?' ('+nameSuffix+')':'') +'</option>').appendTo(groupHtml?groupHtml:selectedItemElement);
                        });

                        // Enable item selection
                        selectedItemElement.multipleSelect('enable');
                        selectedItemElement.multipleSelect('refresh');
                        // Finally, set the value of the input select to the selected value

                        if (typeof(itemName) === 'object') {
                            for (var index in itemName) {
                                console.log(itemName[index]);
                                selectedItemElement.multipleSelect('check', itemName[index]);
                            }
                        } else {
                            selectedItemElement.multipleSelect('check', itemName);
                            // selectedItemElement.val(itemName);
                        }

                        // // Rebuild bootstrap multiselect form
                        // selectedItemElement.multipleSelect('refresh');
                        // // Trim selected item string length with elipsis

                        // // Trim selected item string length with elipsis
                        var selectItemSpanElement = $(`span.multiselect-selected-text:contains("${itemName}")`);
                        var sHTML = selectItemSpanElement.html();
                        selectItemSpanElement.html(wb_truncateWithEllipses(sHTML, 35));

                    } catch (error) {
                        console.error('Error #4534');
                        console.log(error);
                    }
                })
                .fail(function (jqXHR, textStatus, errorThrown) {
                    // Disable item selection if no items were retrieved
                    selectedItemElement.multipleSelect('disable');
                    selectedItemElement.multipleSelect('refresh');
                    //console.error(`Error: ${errorThrown}`);
                });

        } else {
            // Disable item selection if no (valid) controller was selected
            selectedItemElement.multipleSelect('disable');
            selectedItemElement.multipleSelect('refresh');
        }
    }


    var WbServerElement = $('#node-input-server');
    var refreshListElement = $('#force-refresh');
    var selectedItemElement = $(selectedItemElementName);


    // Initialize  multiselect
    selectedItemElement.multipleSelect({
        maxHeight: 300,
        dropWidth: 320,
        width: 320,
        filter: true
    });

    var values = [];
    var isMultiple = selectedItemElement.attr('multiple')!==undefined;
    if (isMultiple) {
        values = selectedItemElement.val().length ? selectedItemElement.val() : nodeItem;
    } else {
        values = selectedItemElement.val() || nodeItem;
    }

    // Initial call to populate item list
    WB_updateItemList(RED.nodes.node(WbServerElement.val()), selectedItemElement, values, false);

    // onChange event handler in case a new controller gets selected
    WbServerElement.change(function (event) {
        WB_updateItemList(RED.nodes.node(WbServerElement.val()), selectedItemElement, values, true);
    });
    refreshListElement.click(function (event) {
        // Force a refresh of the item list
        WB_updateItemList(RED.nodes.node(WbServerElement.val()), selectedItemElement, values, true);
    });
}

function wb_truncateWithEllipses(text, max = 30) {
    if (text) {
        return text.substr(0, max - 1) + (text.length > max ? '&hellip;' : '');
    } else {
        return text;
    }
}