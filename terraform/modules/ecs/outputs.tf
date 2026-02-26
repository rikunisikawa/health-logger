output "alb_dns_name"    { value = aws_lb.main.dns_name }
output "ecr_repo_url"    { value = aws_ecr_repository.app.repository_url }
output "cluster_name"    { value = aws_ecs_cluster.main.name }
output "service_name"    { value = aws_ecs_service.app.name }
output "app_sg_id"       { value = aws_security_group.app.id }
