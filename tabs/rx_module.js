function tab_initialize_rx_module(connected) {
    ga_tracker.sendAppView('RX Module');

    if (connected != 1) {
        $('#content').load("./tabs/rx_connecting.html", function() {
            GUI.active_tab = 'rx_connecting';

            // translate to user-selected language
            localize();

            // UI hooks
            $('a.retry').click(function() {
                $(this).hide();

                // start countdown timer
                var rx_join_configuration_counter = 30;
                GUI.interval_add('RX_join_configuration', function() {
                    rx_join_configuration_counter--;

                    $('span.countdown').html(rx_join_configuration_counter);

                    if (rx_join_configuration_counter <= 0) {
                        // stop counter (in case its still running)
                        GUI.interval_remove('RX_join_configuration');
                    }
                }, 1000, true);

                // request to join RX configuration via wifi
                console.log('Requesting to join RX wireless configuration');
                GUI.log(chrome.i18n.getMessage('rx_module_try_to_establish_connection'));

                PSP.send_message(PSP.PSP_REQ_RX_JOIN_CONFIGURATION, false, false, function(result) {
                    GUI.interval_remove('RX_join_configuration'); // stop counter

                    if (GUI.active_tab == 'rx_connecting') {
                        var connected_to_RX = parseInt(result.data.getUint8(0));
                        switch (connected_to_RX) {
                            case 1:
                                console.log('Connection to the RX successfully established');
                                GUI.log(chrome.i18n.getMessage('rx_module_connection_established_ok'));

                                PSP.send_message(PSP.PSP_REQ_RX_CONFIG, false, false, get_special_pins);

                                function get_special_pins() {
                                    PSP.send_message(PSP.PSP_REQ_SPECIAL_PINS, false, false, get_number_of_outputs);
                                }

                                function get_number_of_outputs() {
                                    PSP.send_message(PSP.PSP_REQ_NUMBER_OF_RX_OUTPUTS, false, false, function() { // this closure is required
                                        tab_initialize_rx_module(true)
                                    });
                                }
                                break;
                            case 2:
                                console.log('Connection to the RX timed out');
                                GUI.log(chrome.i18n.getMessage('rx_module_connection_timed_out'));

                                $('a.retry').show();
                                break;
                            case 3:
                                console.log('Failed response from the RX module');
                                GUI.log(chrome.i18n.getMessage('rx_module_faulty_response'));

                                $('a.retry').show();
                                break;
                        }
                    } else {
                        console.log('Connection request to the RX was canceled');
                        GUI.log(chrome.i18n.getMessage('rx_module_connection_request_canceled'));
                    }
                });
            }).click(); // software click to trigger this
        });
    } else {
        function channel_output_list(element, index) {
            // standard outputs
            for (var i = 0; i < 16; i++) {
                element.append('<option value="' + i + '">' + (i + 1) + '</option>');
            }

            // special functions
            // we used analog 0 and 1 in this sequence while it was static, we might consider using it again
            for (var i = 0; i < RX_SPECIAL_PINS.length; i++) {
                var data = RX_SPECIAL_PINS[i];

                if (data.pin == index) {
                    if (PIN_MAP.hasOwnProperty(data.type)) { // else - list custom functions that aren't supported by current PIN_MAP
                        element.append('<option value="' + data.type + '">' + PIN_MAP[data.type] + '</option>');

                        if (PIN_MAP[data.type] == 'PPM') element.css('border', '1px solid #08CF30');
                    } else {
                        element.append('<option value="' + data.type + '">?' + data.type + '?</option>');
                    }
                }
            }

            // switches
            for (var i = 0; i < 16; i++) {
                element.append('<option value="' + (i + 16) + '">S' + (i + 1) + '</option>');
            }
        }

        // non linear mapping
        // 0 - disabled
        // 1-99    - 100ms - 9900ms (100ms res)
        // 100-189 - 10s  - 99s   (1s res)
        // 190-209 - 100s - 290s (10s res)
        // 210-255 - 5m - 50m (1m res)
        function failsafe_update_slider(slider_element, text_element) {
            var val = parseInt($(slider_element).val());

            if (val == 0) {
                text_element.html(chrome.i18n.getMessage('rx_module_disabled'));
            } else if (val < 100) {
                val *= 100;
                text_element.html(val + ' ms');
            } else if (val < 190) {
                val = (val - 90);
                text_element.html(val + ' s');
            } else if (val < 210) {
                val = (val - 180) * 10;
                text_element.html(val + ' s');
            } else {
                val = (val - 205);
                text_element.html(val + ' m');
            }
        }

        $('#content').load("./tabs/rx_module.html", function() {
            GUI.active_tab = 'rx_module';

            // translate to user-selected language
            localize();

            validate_bounds('input[type="number"]');

            // fill in the values
            if (bit_check(RX_CONFIG.flags, 1)) { // Always Bind
                $('select[name="bind_on_startup"]').val(1);
            }

            if (bit_check(RX_CONFIG.flags, 0)) { // limit ppm to 8 channels
                $('select[name="limit_ppm"]').val(1);
            }

            if (bit_check(RX_CONFIG.flags, 2)) { // enable slave mode
                $('select[name="slave_mode"]').val(1);
            }

            if (bit_check(RX_CONFIG.flags, 3)) { // immediate output
                $('select[name="immediate_output"]').val(1);
            }

            if (bit_check(RX_CONFIG.flags, 7)) { // watchdog
                $('div.info span.watchdog').html(chrome.i18n.getMessage('rx_module_enabled'));
            } else {
                $('div.info span.watchdog').html(chrome.i18n.getMessage('rx_module_disabled'));
            }

            $('input[name="sync_time"]').val(RX_CONFIG.minsync);
            $('select[name="rssi_inject"]').val(RX_CONFIG.RSSIpwm);

            // failsafe
            $('input[name="failsafe_delay"]').val(RX_CONFIG.failsafe_delay);
            $('input[name="stop_pwm_failsafe"]').val(RX_CONFIG.pwmStopDelay);
            $('input[name="stop_ppm_failsafe"]').val(RX_CONFIG.ppmStopDelay);

            // beacon
            $('div.beacon span.note').prop('title',
                'Supported frequency range: ' + MIN_RFM_FREQUENCY + ' Hz - ' + MAX_RFM_FREQUENCY + ' Hz');

            $('input[name="beacon_frequency"]').val(RX_CONFIG.beacon_frequency);
            $('input[name="beacon_interval"]').val(RX_CONFIG.beacon_interval);
            $('input[name="beacon_deadtime"]').val(RX_CONFIG.beacon_deadtime + 100); // +100 because slider range is 100-355 and variable range is 0-255

            // info
            var board;
            switch (RX_CONFIG.rx_type) {
                case 1:
                    board = 'Flytron / Orange RX 8 channel';
                    break;
                case 2:
                    board = 'DTF UHF 4 ch. / Hawkeye 6 ch.';
                    break;
                case 3:
                    board = 'OpenLRSng 12 channel';
                    break;
                case 4:
                    board = 'DTF UHF 10 channel RX32';
                    break;
                case 7:
                    board = 'PowerTowerRX';
                    break;
                default:
                    board = chrome.i18n.getMessage('rx_module_unknown');
            }
            $('div.info span.board').html(board);

            // channel output stuff

            // generate select fields
            $('div.channel_output dl').empty();

            for (var i = 0; i < numberOfOutputsOnRX; i++) {
                $('div.channel_output dl').append('<dt>Port ' + (i + 1) + '</dt>');
                $('div.channel_output dl').append('<dd><select name="port-' + (i + 1) + '"></select></dd>');

                channel_output_list($('div.channel_output select:last'), i);

                // select each value according to RX_CONFIG
                $('div.channel_output select:last').val(RX_CONFIG.pinMapping[i]);
            }

            // UI Hooks
            // update failsafe sliders
            $('input[name="failsafe_delay"]').on('input', function() {
                failsafe_update_slider(this, $('span.failsafe_delay_val'));
            }).trigger('input');

            $('input[name="stop_pwm_failsafe"]').on('input', function() {
                failsafe_update_slider(this, $('span.stop_pwm_failsafe_val'));
            }).trigger('input');

            $('input[name="stop_ppm_failsafe"]').on('input', function() {
                failsafe_update_slider(this, $('span.stop_ppm_failsafe_val'));
            }).trigger('input');

            // beacon hybrid element
            $('select[name="beacon_frequency_helper"]').prop('selectedIndex', -1); // go out of range to also capture "disabled"
            $('select[name="beacon_frequency_helper"]').change(function() {
                $('input[name="beacon_frequency"]').val(parseInt($(this).val()));
                $(this).prop('selectedIndex', -1); // reset to out of range position (user can use value from select, delete value manually and then select the same value)
            });

            // update beacon sliders
            $('input[name="beacon_interval"]').on('input', function() {
                $('span.beacon_interval_val').html($(this).val() + ' s');
            }).trigger('input');

            $('input[name="beacon_deadtime"]').on('input', function() {
                failsafe_update_slider(this, $('span.beacon_deadtime_val'));
            }).trigger('input');

            $('a.save_to_file').click(function() {
                save_object_to_file(RX_CONFIG, 'RX_configuration_backup', function(result) {
                    GUI.log(chrome.i18n.getMessage('rx_module_configuration_saved'));
                });
            });

            $('a.restore_from_file').click(function() {
                restore_from_file(function(result) {
                    if (result.type == 'RX_configuration_backup') {
                        // validate object properties and object lengths
                        var valid = true;
                        for (var property in RX_CONFIG) {
                            if (!result.obj.hasOwnProperty(property)) {
                                valid = false;
                                break;
                            }
                        }

                        if (Object.keys(RX_CONFIG).length != Object.keys(result.obj).length) valid = false;

                        if (valid) {
                            RX_CONFIG = result.obj;

                            send_RX_config(function() {
                                GUI.log(chrome.i18n.getMessage('rx_module_configuration_restored'));

                                tab_initialize_rx_module();
                            });
                        } else {
                            GUI.log(chrome.i18n.getMessage('rx_module_data_structure_invalid'));
                            GUI.log(chrome.i18n.getMessage('rx_module_backup_file_generated_on', [result.configurator_version, read_firmware_version(result.firmware_version).str]));
                            GUI.log(chrome.i18n.getMessage('rx_module_current_configurator_version', [chrome.runtime.getManifest().version, firmware_version_embedded[0] + '.' + firmware_version_embedded[1] + '.' + firmware_version_embedded[2]]));
                        }
                    } else {
                        GUI.log(chrome.i18n.getMessage('rx_module_incorrect_data_structure'));
                    }
                });
            });

            $('a.edit_failsafe_values').click(function() {
                PSP.send_message(PSP.PSP_REQ_RX_FAILSAFE, false, false, tab_initialize_rx_failsafe);
            });

            $('a.restore_default').click(function() {
                PSP.send_message(PSP.PSP_SET_RX_RESTORE_DEFAULT, false, false, get_latest_data);

                function get_latest_data() {
                    PSP.send_message(PSP.PSP_REQ_RX_CONFIG, false, false, tab_initialize_rx_module);
                }
            });

            $('a.save_to_eeprom').click(function() {
                var validation_result = true;
                // custom beacon frequency validation
                var beacon_frequency = parseInt($('input[name="beacon_frequency"]').val());

                if (beacon_frequency == 0 || beacon_frequency >= MIN_RFM_FREQUENCY && beacon_frequency <= MAX_RFM_FREQUENCY) {
                    // all valid
                    $('input[name="beacon_frequency"], select[name="beacon_frequency_helper"]').removeClass('validation_failed');
                } else {
                    validation_result = false;

                    $('input[name="beacon_frequency"], select[name="beacon_frequency_helper"]').addClass('validation_failed');
                }


                if (validation_result) {
                    // we need to "grasp" all values from the UI, store it in the local RX_CONFIG object
                    // send this object to the module and then request EEPROM save
                    RX_CONFIG.failsafe_delay = parseInt($('input[name="failsafe_delay"]').val());

                    if (parseInt($('select[name="bind_on_startup"]').val()) == 1) {
                        RX_CONFIG.flags = bit_set(RX_CONFIG.flags, 1);
                    } else {
                        RX_CONFIG.flags = bit_clear(RX_CONFIG.flags, 1);
                    }

                    if (parseInt($('select[name="limit_ppm"]').val()) == 1) {
                        RX_CONFIG.flags = bit_set(RX_CONFIG.flags, 0);
                    } else {
                        RX_CONFIG.flags = bit_clear(RX_CONFIG.flags, 0);
                    }

                    if (parseInt($('select[name="slave_mode"]').val()) == 1) {
                        RX_CONFIG.flags = bit_set(RX_CONFIG.flags, 2);
                    } else {
                        RX_CONFIG.flags = bit_clear(RX_CONFIG.flags, 2);
                    }

                    if (parseInt($('select[name="immediate_output"]').val()) == 1) {
                        RX_CONFIG.flags = bit_set(RX_CONFIG.flags, 3);
                    } else {
                        RX_CONFIG.flags = bit_clear(RX_CONFIG.flags, 3);
                    }


                    RX_CONFIG.minsync = parseInt($('input[name="sync_time"]').val());
                    RX_CONFIG.RSSIpwm = parseInt($('select[name="rssi_inject"]').val());

                    RX_CONFIG.pwmStopDelay = parseInt($('input[name="stop_pwm_failsafe"]').val());
                    RX_CONFIG.ppmStopDelay = parseInt($('input[name="stop_ppm_failsafe"]').val());

                    RX_CONFIG.beacon_frequency = parseInt($('input[name="beacon_frequency"]').val());
                    RX_CONFIG.beacon_interval = parseInt($('input[name="beacon_interval"]').val());
                    RX_CONFIG.beacon_deadtime = parseInt($('input[name="beacon_deadtime"]').val()) - 100; // -100 because slider range is 100-355 where variable range is 0-255

                    var channel_output_port_key = 0;
                    $('div.channel_output select').each(function() {
                        RX_CONFIG.pinMapping[channel_output_port_key++] = $(this).val();
                    });

                    send_RX_config();
                } else {
                    GUI.log(chrome.i18n.getMessage('rx_module_validation_failed_message_1'));
                    GUI.log(chrome.i18n.getMessage('rx_module_validation_failed_message_2'));
                }
            });
        });
    }
}