output "gha_role_arn" {
  value = aws_iam_role.gha_deploy.arn
}

output "oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github.arn
}

output "image_tag_param_name" {
  value = aws_ssm_parameter.app_image_tag.name
}

output "image_tag_param_arn" {
  value = aws_ssm_parameter.app_image_tag.arn
}
