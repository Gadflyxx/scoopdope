#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Vec};

fn setup() -> (Env, ScholarshipFundContractClient<'static>, Address) {
    let env    = Env::default();
    env.mock_all_auths();
    let id     = env.register(ScholarshipFundContract, ());
    let client = ScholarshipFundContractClient::new(&env, &id);
    let admin  = Address::generate(&env);
    client.initialize(&admin);
    (env, client, admin)
}

#[test]
fn donate_increases_fund_balance() {
    let (_, client, _) = setup();
    let donor = Address::generate(&client.env);
    client.donate(&donor, &1_000_000);
    assert_eq!(client.get_fund_balance(), 1_000_000);
    assert_eq!(client.get_donor_total(&donor), 1_000_000);
}

#[test]
fn apply_and_approve_then_distribute() {
    let (_, client, admin) = setup();
    let donor   = Address::generate(&client.env);
    let student = Address::generate(&client.env);
    client.donate(&donor, &5_000_000);
    let app_id = client.apply_for_scholarship(&student, &1_000_000);
    client.approve_application(&admin, &app_id);
    let before = client.get_fund_balance();
    client.distribute_scholarship(&admin, &app_id);
    let after = client.get_fund_balance();
    assert_eq!(before - after, 1_000_000);
}

#[test]
fn reject_application_does_not_disburse() {
    let (_, client, admin) = setup();
    let donor   = Address::generate(&client.env);
    let student = Address::generate(&client.env);
    client.donate(&donor, &2_000_000);
    let app_id = client.apply_for_scholarship(&student, &500_000);
    client.reject_application(&admin, &app_id);
    assert_eq!(client.get_fund_balance(), 2_000_000);
}

#[test]
fn get_application_returns_correct_data() {
    let (_, client, _) = setup();
    let student = Address::generate(&client.env);
    let app_id  = client.apply_for_scholarship(&student, &750_000);
    let app     = client.get_application(&app_id).expect("application exists");
    assert_eq!(app.student, student);
    assert_eq!(app.amount_requested, 750_000);
    assert_eq!(app.status, 0); // pending
}

#[test]
#[should_panic]
fn distribute_before_approve_panics() {
    let (_, client, admin) = setup();
    let donor   = Address::generate(&client.env);
    let student = Address::generate(&client.env);
    client.donate(&donor, &2_000_000);
    let app_id = client.apply_for_scholarship(&student, &500_000);
    client.distribute_scholarship(&admin, &app_id); // not approved yet
}

#[test]
fn disburse_full_transfers_to_each_recipient() {
    let (env, client, admin) = setup();
    let donor = Address::generate(&env);
    client.donate(&donor, &10_000_000);

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let a1 = client.apply_for_scholarship(&s1, &2_000_000);
    let a2 = client.apply_for_scholarship(&s2, &3_000_000);
    client.approve_application(&admin, &a1);
    client.approve_application(&admin, &a2);

    let mut recipients = Vec::new(&env);
    recipients.push_back(a1);
    recipients.push_back(a2);

    let before = client.get_fund_balance();
    client.disburse(&admin, &recipients);
    let after = client.get_fund_balance();

    assert_eq!(before - after, 5_000_000);
    assert_eq!(client.get_application(&a1).unwrap().status, 2); // disbursed
    assert_eq!(client.get_application(&a2).unwrap().status, 2);
}

#[test]
fn disburse_partial_transfers_only_listed_recipients() {
    let (env, client, admin) = setup();
    let donor = Address::generate(&env);
    client.donate(&donor, &10_000_000);

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let a1 = client.apply_for_scholarship(&s1, &2_000_000);
    let a2 = client.apply_for_scholarship(&s2, &3_000_000);
    client.approve_application(&admin, &a1);
    client.approve_application(&admin, &a2);

    let mut recipients = Vec::new(&env);
    recipients.push_back(a1);

    let before = client.get_fund_balance();
    client.disburse(&admin, &recipients);
    let after = client.get_fund_balance();

    assert_eq!(before - after, 2_000_000);
    assert_eq!(client.get_application(&a1).unwrap().status, 2);
    assert_eq!(client.get_application(&a2).unwrap().status, 1); // still approved
}

#[test]
fn disburse_over_amount_returns_error() {
    let (env, client, admin) = setup();
    let donor = Address::generate(&env);
    client.donate(&donor, &1_000_000);

    let s1 = Address::generate(&env);
    let a1 = client.apply_for_scholarship(&s1, &2_000_000);
    client.approve_application(&admin, &a1);

    let mut recipients = Vec::new(&env);
    recipients.push_back(a1);

    let result = client.try_disburse(&admin, &recipients);
    assert!(result.is_err());
    assert_eq!(client.get_fund_balance(), 1_000_000);
}
